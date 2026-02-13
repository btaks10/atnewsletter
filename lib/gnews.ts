import { supabase } from "./supabase";
import { getArticleAgeCutoff } from "./config";
import { findDuplicate } from "./dedup";

interface GNewsArticle {
  title: string;
  description: string;
  content: string;
  url: string;
  image: string;
  publishedAt: string;
  source: {
    name: string;
    url: string;
  };
}

interface GNewsResponse {
  totalArticles: number;
  articles: GNewsArticle[];
}

interface GNewsQuery {
  id: number;
  query: string;
  category: string | null;
  priority: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGNews(
  query: string,
  apiKey: string,
  fromDate: string
): Promise<GNewsResponse> {
  const params = new URLSearchParams({
    q: query,
    lang: "en",
    max: "25",
    sortby: "publishedAt",
    from: fromDate,
    apikey: apiKey,
  });

  const res = await fetch(`https://gnews.io/api/v4/search?${params}`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GNews API error ${res.status}: ${body.slice(0, 200)}`);
  }

  return (await res.json()) as GNewsResponse;
}

export async function runGNewsIngestion() {
  const apiKey = process.env.GNEWS_API_KEY;
  if (!apiKey) {
    return {
      success: true,
      skipped: true,
      reason: "GNEWS_API_KEY not configured",
      queries_run: 0,
      total_articles_found: 0,
      new_articles_inserted: 0,
      duplicates_skipped: 0,
      errors: [] as string[],
    };
  }

  const fromDate = getArticleAgeCutoff();

  // Read active queries from DB, ordered by priority desc
  const { data: queries, error: queryError } = await supabase
    .from("gnews_queries")
    .select("id, query, category, priority")
    .eq("is_active", true)
    .order("priority", { ascending: false });

  if (queryError) {
    throw new Error(`Failed to fetch GNews queries: ${queryError.message}`);
  }

  if (!queries || queries.length === 0) {
    return {
      success: true,
      skipped: true,
      reason: "No active GNews queries found",
      queries_run: 0,
      total_articles_found: 0,
      new_articles_inserted: 0,
      duplicates_skipped: 0,
      errors: [] as string[],
    };
  }

  const results = {
    success: true,
    skipped: false,
    queries_run: 0,
    total_articles_found: 0,
    new_articles_inserted: 0,
    duplicates_skipped: 0,
    errors: [] as string[],
  };

  for (const q of queries) {
    try {
      const response = await fetchGNews(q.query, apiKey, fromDate);
      results.queries_run++;
      results.total_articles_found += response.articles.length;

      let queryNewCount = 0;

      for (const article of response.articles) {
        // Check for existing article by URL
        const { data: existing } = await supabase
          .from("articles")
          .select("id")
          .eq("url", article.url)
          .maybeSingle();

        if (existing) {
          results.duplicates_skipped++;
          continue;
        }

        // Title-based fuzzy dedup
        const duplicateOfId = await findDuplicate(article.title);
        if (duplicateOfId) {
          await supabase.from("articles").insert({
            title: article.title,
            url: article.url,
            source: article.source.name,
            source_type: "gnews_api",
            author: null,
            published_at: article.publishedAt,
            raw_content: article.content || article.description || null,
            analyzed: true,
            duplicate_of: duplicateOfId,
          });
          results.duplicates_skipped++;
          continue;
        }

        const { error: insertError } = await supabase
          .from("articles")
          .insert({
            title: article.title,
            url: article.url,
            source: article.source.name,
            source_type: "gnews_api",
            author: null,
            published_at: article.publishedAt,
            raw_content: article.content || article.description || null,
          });

        if (insertError) {
          // Likely a duplicate caught by unique constraint
          if (insertError.message.includes("duplicate")) {
            results.duplicates_skipped++;
          } else {
            results.errors.push(
              `Insert failed for ${article.url}: ${insertError.message}`
            );
          }
        } else {
          results.new_articles_inserted++;
          queryNewCount++;
        }
      }

      // Update query tracking
      await supabase
        .from("gnews_queries")
        .update({
          last_run_at: new Date().toISOString(),
          last_result_count: response.articles.length,
        })
        .eq("id", q.id);
    } catch (err: any) {
      results.errors.push(`Query "${q.query}" failed: ${err?.message}`);
      // Continue to next query
    }

    // Rate limiting: 200ms between requests (Essentials plan)
    await sleep(200);
  }

  return results;
}
