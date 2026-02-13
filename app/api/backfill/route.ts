import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { normalizeTitle, jaccardSimilarity } from "@/lib/dedup";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

export async function POST() {
  try {
    const results = {
      google_news_fixed: 0,
      international_flagged: 0,
      duplicates_marked: 0,
      errors: [] as string[],
    };

    // --- Step 1: Fix Google News source labels ---
    const { data: gnFeeds } = await supabase
      .from("rss_feeds")
      .select("name")
      .ilike("url", "%news.google.com%");

    if (gnFeeds && gnFeeds.length > 0) {
      const feedNames = gnFeeds.map((f: any) => f.name);

      const { data: gnArticles } = await supabase
        .from("articles")
        .select("id, title, source")
        .in("source", feedNames)
        .eq("source_type", "rss");

      if (gnArticles) {
        for (const article of gnArticles) {
          const lastDash = article.title.lastIndexOf(" - ");
          if (lastDash === -1) continue;

          const cleanedTitle = article.title.slice(0, lastDash).trim();
          const publisher = article.title.slice(lastDash + 3).trim();

          if (!cleanedTitle || !publisher) continue;

          const { error } = await supabase
            .from("articles")
            .update({ title: cleanedTitle, source: publisher })
            .eq("id", article.id);

          if (error) {
            results.errors.push(`GN fix ${article.id}: ${error.message}`);
          } else {
            results.google_news_fixed++;
          }
        }
      }
    }

    // --- Step 2: Set is_international for "International" category ---
    const { count: intlCount } = await supabase
      .from("article_analysis")
      .select("*", { count: "exact", head: true })
      .eq("category", "International")
      .eq("is_international", false);

    const { error: intlError } = await supabase
      .from("article_analysis")
      .update({ is_international: true })
      .eq("category", "International")
      .eq("is_international", false);

    if (intlError) {
      results.errors.push(`INTL flag: ${intlError.message}`);
    } else {
      results.international_flagged = intlCount ?? 0;
    }

    // --- Step 3: Mark duplicates ---
    const { data: allArticles } = await supabase
      .from("articles")
      .select("id, title, fetched_at")
      .is("duplicate_of", null)
      .order("fetched_at", { ascending: true });

    if (allArticles && allArticles.length > 0) {
      const normalized = allArticles.map((a: any) => ({
        id: a.id,
        norm: normalizeTitle(a.title),
      }));

      const duplicateUpdates: { id: string; duplicate_of: string }[] = [];

      for (let i = 1; i < normalized.length; i++) {
        if (normalized[i].norm.split(" ").length < 3) continue;

        for (let j = 0; j < i; j++) {
          // Skip if the earlier article is already a duplicate itself
          if (duplicateUpdates.some((d) => d.id === normalized[j].id)) continue;

          const sim = jaccardSimilarity(normalized[i].norm, normalized[j].norm);
          if (sim > 0.85) {
            duplicateUpdates.push({
              id: normalized[i].id,
              duplicate_of: normalized[j].id,
            });
            break; // Found a match, move to next article
          }
        }
      }

      for (const dup of duplicateUpdates) {
        const { error } = await supabase
          .from("articles")
          .update({ duplicate_of: dup.duplicate_of })
          .eq("id", dup.id);

        if (error) {
          results.errors.push(`Dedup ${dup.id}: ${error.message}`);
        } else {
          results.duplicates_marked++;
        }
      }
    }

    // --- Step 4: Cluster ALL unclustered relevant articles (no time window) ---
    const clustering = { clusters_created: 0, articles_clustered: 0, clustering_errors: [] as string[] };

    const { data: unclustered, error: clusterFetchErr } = await supabase
      .from("article_analysis")
      .select(`
        id,
        article_id,
        summary,
        category,
        articles!inner (
          title,
          source
        )
      `)
      .eq("is_relevant", true)
      .is("cluster_id", null);

    if (clusterFetchErr) {
      clustering.clustering_errors.push(`Fetch: ${clusterFetchErr.message}`);
    } else if (unclustered && unclustered.length >= 2) {
      // Group by category
      const byCategory = new Map<string, any[]>();
      for (const row of unclustered) {
        const cat = row.category || "Other";
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat)!.push(row);
      }

      const categoryEntries = [...byCategory.entries()].filter(
        ([, arts]) => arts.length >= 2
      );

      const clusterResults = await Promise.allSettled(
        categoryEntries.map(async ([category, articles]) => {
          const articlesJson = articles.map((a: any) => ({
            id: a.id,
            title: a.articles.title,
            source: a.articles.source,
            summary: a.summary,
            category: a.category,
          }));

          const response = await anthropic.messages.create({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 8192,
            system: "You group news articles by shared underlying story. Respond with valid JSON only, no other text.",
            messages: [{
              role: "user",
              content: `You are grouping news articles that cover the SAME underlying story or event.

Articles covering the same story should be clustered together. Articles are about the same story if they:
- Report on the same specific incident, event, or announcement
- Cover the same person's statement or action
- Reference the same report, study, or data release

Articles should NOT be clustered if they:
- Are about the same general topic but different events
- Are about the same organization but different actions
- Are loosely related but report on distinct news

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

Return ONLY the JSON array, no other text.`,
            }],
          });

          let text = response.content[0].type === "text" ? response.content[0].text : "[]";
          text = text.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");

          let clusters;
          try {
            clusters = JSON.parse(text);
          } catch {
            throw new Error(`${category}: JSON parse failed`);
          }
          return { category, clusters };
        })
      );

      // Process results: insert clusters and update article_analysis
      const articleMap = new Map(unclustered.map((a: any) => [a.id, a]));

      for (const result of clusterResults) {
        if (result.status === "rejected") {
          clustering.clustering_errors.push(result.reason?.message || String(result.reason));
          continue;
        }

        for (const cluster of result.value.clusters) {
          if (cluster.related_article_ids.length === 0) continue;

          const primaryArticle = articleMap.get(cluster.primary_article_id);
          if (!primaryArticle) continue;

          const { data: inserted, error: insertErr } = await supabase
            .from("story_clusters")
            .insert({
              cluster_headline: cluster.cluster_headline,
              article_count: 1 + cluster.related_article_ids.length,
              category: primaryArticle.category,
            })
            .select("id")
            .single();

          if (insertErr || !inserted) {
            clustering.clustering_errors.push(`Insert cluster: ${insertErr?.message}`);
            continue;
          }

          await supabase
            .from("article_analysis")
            .update({ cluster_id: inserted.id, is_primary_in_cluster: true })
            .eq("id", cluster.primary_article_id);

          if (cluster.related_article_ids.length > 0) {
            await supabase
              .from("article_analysis")
              .update({ cluster_id: inserted.id, is_primary_in_cluster: false })
              .in("id", cluster.related_article_ids);
          }

          clustering.clusters_created++;
          clustering.articles_clustered += 1 + cluster.related_article_ids.length;
        }
      }
    }

    return NextResponse.json({ success: true, ...results, ...clustering });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
