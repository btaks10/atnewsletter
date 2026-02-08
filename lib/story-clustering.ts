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

  // Group articles by category and cluster each group separately
  // (prompt already says "only cluster within same category")
  const byCategory = new Map<string, ClusterInput[]>();
  for (const a of articles) {
    const cat = a.category || "Other";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(a);
  }

  const articleMap = new Map(articles.map((a) => [a.analysis_id, a]));
  let clustersCreated = 0;
  let articlesClustered = 0;
  const errors: string[] = [];

  // Cluster all categories in parallel
  const categoryEntries = [...byCategory.entries()].filter(
    ([, arts]) => arts.length >= 2
  );

  const clusterResults = await Promise.allSettled(
    categoryEntries.map(async ([category, categoryArticles]) => {
      const response = await anthropic.messages.create({
        model: CLUSTERING_MODEL,
        max_tokens: 8192,
        system:
          "You group news articles by shared underlying story. Respond with valid JSON only, no other text.",
        messages: [
          {
            role: "user",
            content: buildClusteringPrompt(categoryArticles),
          },
        ],
      });

      let text =
        response.content[0].type === "text" ? response.content[0].text : "[]";
      text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");

      let clusters: ClusterResult[];
      try {
        clusters = JSON.parse(text);
      } catch {
        throw new Error(`${category}: JSON parse failed`);
      }
      return { category, clusters };
    })
  );

  // Collect all valid clusters from all categories
  const allClusters: { cluster: ClusterResult; category: string }[] = [];
  for (const result of clusterResults) {
    if (result.status === "rejected") {
      errors.push(result.reason?.message || String(result.reason));
      continue;
    }
    for (const cluster of result.value.clusters) {
      if (cluster.related_article_ids.length === 0) continue;
      const primaryArticle = articleMap.get(cluster.primary_article_id);
      if (!primaryArticle) continue;
      allClusters.push({ cluster, category: primaryArticle.category });
    }
  }

  // Batch insert all story_clusters at once
  if (allClusters.length > 0) {
    const clusterRows = allClusters.map((c) => ({
      cluster_headline: c.cluster.cluster_headline,
      article_count: 1 + c.cluster.related_article_ids.length,
      category: c.category,
    }));

    const { data: insertedClusters, error: insertErr } = await supabase
      .from("story_clusters")
      .insert(clusterRows)
      .select("id");

    if (insertErr || !insertedClusters) {
      errors.push(`Batch cluster insert: ${insertErr?.message}`);
    } else {
      clustersCreated = insertedClusters.length;

      // Batch update all article_analysis rows
      for (let i = 0; i < insertedClusters.length; i++) {
        const clusterId = insertedClusters[i].id;
        const c = allClusters[i].cluster;

        await supabase
          .from("article_analysis")
          .update({ cluster_id: clusterId, is_primary_in_cluster: true })
          .eq("id", c.primary_article_id);

        if (c.related_article_ids.length > 0) {
          await supabase
            .from("article_analysis")
            .update({ cluster_id: clusterId, is_primary_in_cluster: false })
            .in("id", c.related_article_ids);
        }

        articlesClustered += 1 + c.related_article_ids.length;
      }
    }
  }

  return {
    skipped: false,
    clusters_created: clustersCreated,
    articles_clustered: articlesClustered,
    total_relevant: articles.length,
    categories_processed: byCategory.size,
    ...(errors.length > 0 ? { errors } : {}),
  };
}
