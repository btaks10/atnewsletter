import type { VercelRequest, VercelResponse } from "@vercel/node";
import { RSS_FEEDS } from "../lib/config";
import { ingestFeed } from "../lib/rss";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const results = [];
  const errors: string[] = [];
  let totalFound = 0;
  let totalNew = 0;
  let sourcesFailed = 0;

  for (const feed of RSS_FEEDS) {
    const result = await ingestFeed(feed);
    results.push(result);
    totalFound += result.articles_found;
    totalNew += result.articles_new;
    if (result.status === "failure") {
      sourcesFailed++;
      if (result.error) {
        errors.push(`${feed.name}: ${result.error}`);
      }
    }
  }

  return res.status(200).json({
    success: true,
    sources_processed: RSS_FEEDS.length,
    sources_failed: sourcesFailed,
    total_articles_found: totalFound,
    new_articles_inserted: totalNew,
    errors,
  });
}
