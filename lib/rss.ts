import Parser from "rss-parser";
import { supabase } from "./supabase";
import { FeedSource } from "./config";

const parser = new Parser({
  timeout: 10000,
});

export interface IngestResult {
  source: string;
  status: "success" | "failure";
  articles_found: number;
  articles_new: number;
  error?: string;
}

export async function ingestFeed(feed: FeedSource): Promise<IngestResult> {
  const errors: string[] = [];
  try {
    const rss = await parser.parseURL(feed.url);

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentItems = rss.items.filter((item) => {
      const pubDate = item.pubDate ? new Date(item.pubDate) : null;
      return pubDate && pubDate > cutoff;
    });

    let newCount = 0;

    for (const item of recentItems) {
      const url = item.link;
      if (!url) continue;

      const { data: existing, error: selectError } = await supabase
        .from("articles")
        .select("id")
        .eq("url", url)
        .maybeSingle();

      if (selectError) {
        errors.push(`Select error for ${url}: ${selectError.message}`);
        continue;
      }
      if (existing) continue;

      const { error: insertError } = await supabase.from("articles").insert({
        url,
        title: item.title || "Untitled",
        author: item.creator || item["dc:creator"] || null,
        source: feed.name,
        published_at: item.pubDate
          ? new Date(item.pubDate).toISOString()
          : new Date().toISOString(),
        raw_content:
          item.contentSnippet || item.content || item.summary || null,
      });

      if (insertError) {
        errors.push(`Insert error: ${insertError.message}`);
      } else {
        newCount++;
      }
    }

    await supabase.from("ingest_logs").insert({
      source: feed.name,
      status: "success",
      articles_found: recentItems.length,
      articles_new: newCount,
    });

    return {
      source: feed.name,
      status: "success",
      articles_found: recentItems.length,
      articles_new: newCount,
      ...(errors.length > 0 ? { error: errors.slice(0, 3).join("; ") } : {}),
    };
  } catch (err: any) {
    const errorMessage = err?.message || String(err);

    await supabase.from("ingest_logs").insert({
      source: feed.name,
      status: "failure",
      articles_found: 0,
      articles_new: 0,
      error_message: errorMessage,
    });

    return {
      source: feed.name,
      status: "failure",
      articles_found: 0,
      articles_new: 0,
      error: errorMessage,
    };
  }
}

export async function runIngestion(feeds: FeedSource[]) {
  const results: IngestResult[] = [];
  let totalFound = 0;
  let totalNew = 0;
  let sourcesFailed = 0;
  const errors: string[] = [];

  for (const feed of feeds) {
    const result = await ingestFeed(feed);
    results.push(result);
    totalFound += result.articles_found;
    totalNew += result.articles_new;
    if (result.status === "failure") {
      sourcesFailed++;
      if (result.error) errors.push(`${feed.name}: ${result.error}`);
    }
  }

  return {
    success: true,
    sources_processed: feeds.length,
    sources_failed: sourcesFailed,
    total_articles_found: totalFound,
    new_articles_inserted: totalNew,
    errors,
  };
}
