import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { RSS_FEEDS } from "@/lib/config";

export async function GET() {
  const sevenDaysAgo = new Date(
    Date.now() - 7 * 24 * 60 * 60 * 1000
  ).toISOString();

  // RSS feeds: config + recent ingest_logs
  const { data: recentLogs } = await supabase
    .from("ingest_logs")
    .select("source, status, articles_found, articles_new, created_at")
    .gte("created_at", sevenDaysAgo)
    .order("created_at", { ascending: false });

  const logsBySource: Record<
    string,
    {
      latestStatus: string;
      latestRun: string;
      totalArticles: number;
      totalNew: number;
    }
  > = {};

  for (const log of recentLogs || []) {
    if (!logsBySource[log.source]) {
      logsBySource[log.source] = {
        latestStatus: log.status,
        latestRun: log.created_at,
        totalArticles: 0,
        totalNew: 0,
      };
    }
    logsBySource[log.source].totalArticles += log.articles_found;
    logsBySource[log.source].totalNew += log.articles_new;
  }

  const rssSources = RSS_FEEDS.map((feed) => ({
    name: feed.name,
    type: feed.type,
    url: feed.url,
    status: logsBySource[feed.name]?.latestStatus || "unknown",
    last_run: logsBySource[feed.name]?.latestRun || null,
    articles_7d: logsBySource[feed.name]?.totalArticles || 0,
    new_articles_7d: logsBySource[feed.name]?.totalNew || 0,
  }));

  // GNews queries
  const { data: gnewsQueries } = await supabase
    .from("gnews_queries")
    .select(
      "id, query, category, is_active, priority, last_run_at, last_result_count"
    )
    .order("priority", { ascending: false });

  return NextResponse.json({
    rss_feeds: rssSources,
    gnews_queries: gnewsQueries || [],
  });
}
