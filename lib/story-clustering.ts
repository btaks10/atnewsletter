import Anthropic from "@anthropic-ai/sdk";
import { getArticleAgeCutoff } from "./config";
import { supabase } from "./supabase";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

const CLUSTERING_MODEL = "claude-haiku-4-5-20251001";

interface ClusterInput {
  analysis_id: string;
  article_id: string;
  title: string;
  source: string;
  summary: string;
  category: string;
}

interface ClusterResult {
  cluster_id: number;
  primary_article_id: string;
  related_article_ids: string[];
  cluster_headline: string;
}

function buildClusteringPrompt(articles: ClusterInput[]): string {
  const articlesJson = articles.map((a) => ({
    id: a.analysis_id,
    title: a.title,
    source: a.source,
    summary: a.summary,
    category: a.category,
  }));

  return `You are grouping news articles that cover the SAME underlying story or event.

Articles covering the same story should be clustered together. Articles are about the same story if they:
- Report on the same specific incident, event, or announcement
- Cover the same person's statement or action
- Reference the same report, study, or data release

Articles should NOT be clustered if they:
- Are about the same general topic but different events (e.g., two separate campus incidents)
- Are about the same organization but different actions
- Are loosely related but report on distinct news

IMPORTANT: Only cluster articles within the SAME category. Never cluster across different categories.

For each cluster, identify the article with the best/most comprehensive summary as the "primary" article.

Input articles:
${JSON.stringify(articlesJson, null, 2)}

Return a JSON array of clusters:
[
  {
    "cluster_id": 1,
    "primary_article_id": "id of primary article",
    "related_article_ids": ["id", "id"],
    "cluster_headline": "Brief 5-8 word description of the shared story"
  }
]

Articles that don't cluster with anything should be returned as single-article clusters with an empty related_article_ids array.

Return ONLY the JSON array, no other text.`;
}

export async function runClustering() {
  const cutoff = getArticleAgeCutoff();

  // Query relevant articles analyzed today
  const { data, error: fetchError } = await supabase
    .from("article_analysis")
    .select(
      `
      id,
      article_id,
      summary,
      category,
      articles!inner (
        title,
        source,
        url
      )
    `
    )
    .eq("is_relevant", true)
    .gte("analyzed_at", cutoff);

  if (fetchError) {
    throw new Error(fetchError.message);
  }

  if (!data || data.length <= 3) {
    return {
      skipped: true,
      reason: data
        ? `Only ${data.length} relevant articles (need 4+)`
        : "No relevant articles",
      clusters_created: 0,
      articles_clustered: 0,
    };
  }

  const articles: ClusterInput[] = data.map((row: any) => ({
    analysis_id: row.id,
    article_id: row.article_id,
    title: row.articles.title,
    source: row.articles.source,
    summary: row.summary,
    category: row.category,
  }));

  // Send to Claude Haiku for clustering
  const response = await anthropic.messages.create({
    model: CLUSTERING_MODEL,
    max_tokens: 4096,
    system:
      "You group news articles by shared underlying story. Respond with valid JSON only, no other text.",
    messages: [
      {
        role: "user",
        content: buildClusteringPrompt(articles),
      },
    ],
  });

  let text =
    response.content[0].type === "text" ? response.content[0].text : "[]";

  // Strip markdown code fences if present
  text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");

  let clusters: ClusterResult[];
  try {
    clusters = JSON.parse(text);
  } catch {
    throw new Error(
      `Failed to parse clustering response: ${text.slice(0, 200)}`
    );
  }

  // Build a lookup from analysis_id to article info
  const articleMap = new Map(articles.map((a) => [a.analysis_id, a]));

  let clustersCreated = 0;
  let articlesClustered = 0;

  // Only persist multi-article clusters (single-article clusters don't need DB rows)
  for (const cluster of clusters) {
    if (cluster.related_article_ids.length === 0) continue;

    const primaryArticle = articleMap.get(cluster.primary_article_id);
    if (!primaryArticle) continue;

    // Create story_clusters row
    const { data: clusterRow, error: insertErr } = await supabase
      .from("story_clusters")
      .insert({
        cluster_headline: cluster.cluster_headline,
        article_count: 1 + cluster.related_article_ids.length,
        category: primaryArticle.category,
      })
      .select("id")
      .single();

    if (insertErr || !clusterRow) {
      console.error(`Cluster insert error: ${insertErr?.message}`);
      continue;
    }

    const clusterId = clusterRow.id;
    clustersCreated++;

    // Update primary article's analysis row
    await supabase
      .from("article_analysis")
      .update({ cluster_id: clusterId, is_primary_in_cluster: true })
      .eq("id", cluster.primary_article_id);

    // Update related articles' analysis rows
    for (const relatedId of cluster.related_article_ids) {
      await supabase
        .from("article_analysis")
        .update({ cluster_id: clusterId, is_primary_in_cluster: false })
        .eq("id", relatedId);
    }

    articlesClustered += 1 + cluster.related_article_ids.length;
  }

  return {
    skipped: false,
    clusters_created: clustersCreated,
    articles_clustered: articlesClustered,
    total_relevant: articles.length,
  };
}
