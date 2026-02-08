import { NextRequest, NextResponse } from "next/server";
import { RSS_FEEDS } from "@/lib/config";
import { runIngestion } from "@/lib/rss";
import { runGNewsIngestion } from "@/lib/gnews";
import { runAnalysis } from "@/lib/claude";
import { runClustering } from "@/lib/story-clustering";
import { runDigest } from "@/lib/email";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

const MAX_ANALYSIS_RETRIES = 3;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-vercel-cron-signature");
  const secret = process.env.TEST_TRIGGER_SECRET;

  const isBearerAuth = authHeader === `Bearer ${secret}`;
  const isCronAuth = !!cronHeader;

  if (!isBearerAuth && !isCronAuth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const startTotal = Date.now();

  try {
    // Step 1: Ingest from RSS and GNews in parallel
    const [rssResult, gnewsResult] = await Promise.allSettled([
      runIngestion(RSS_FEEDS),
      runGNewsIngestion(),
    ]);

    const ingest_rss =
      rssResult.status === "fulfilled"
        ? rssResult.value
        : { success: false, error: rssResult.reason?.message, new_articles_inserted: 0 };

    const ingest_gnews =
      gnewsResult.status === "fulfilled"
        ? gnewsResult.value
        : { success: false, error: gnewsResult.reason?.message, new_articles_inserted: 0 };

    // Step 2: Analyze with Claude (retry if articles remain)
    let analyze;
    let analysisRuns = 0;
    let allProcessed = false;

    for (let attempt = 0; attempt < MAX_ANALYSIS_RETRIES; attempt++) {
      analyze = await runAnalysis();
      analysisRuns++;

      if (analyze.remaining_unanalyzed === 0) {
        allProcessed = true;
        break;
      }
    }

    // Step 3: Cluster related stories
    let clustering;
    try {
      clustering = await runClustering();
    } catch (err: any) {
      console.error(`Clustering failed, continuing without: ${err?.message}`);
      clustering = { skipped: true, reason: `Error: ${err?.message}` };
    }

    // Step 4: Send email digest
    const email = await runDigest();

    const totalDuration = Date.now() - startTotal;

    // Step 5: Log pipeline stats
    await supabase.from("pipeline_stats").insert({
      run_date: new Date().toISOString().split("T")[0],
      articles_ingested:
        (ingest_rss.new_articles_inserted || 0) +
        (ingest_gnews.new_articles_inserted || 0),
      articles_from_rss: ingest_rss.new_articles_inserted || 0,
      articles_from_gnews: ingest_gnews.new_articles_inserted || 0,
      articles_keyword_passed: analyze?.keyword_filter?.passed_filter ?? 0,
      articles_analyzed: analyze?.claude_analysis?.articles_processed ?? 0,
      articles_relevant: analyze?.claude_analysis?.articles_relevant ?? 0,
      clusters_formed: clustering?.clusters_created ?? 0,
      email_sent: true,
      total_duration_ms: totalDuration,
    });

    return NextResponse.json({
      success: true,
      ingest_rss,
      ingest_gnews,
      analyze,
      analysis_runs: analysisRuns,
      all_articles_processed: allProcessed,
      clustering,
      email,
      total_duration_ms: totalDuration,
    });
  } catch (err: any) {
    const totalDuration = Date.now() - startTotal;

    await supabase.from("pipeline_stats").insert({
      run_date: new Date().toISOString().split("T")[0],
      articles_ingested: 0,
      articles_from_rss: 0,
      articles_from_gnews: 0,
      articles_keyword_passed: 0,
      articles_analyzed: 0,
      articles_relevant: 0,
      clusters_formed: 0,
      email_sent: false,
      total_duration_ms: totalDuration,
    });

    return NextResponse.json(
      { success: false, error: err?.message || String(err), total_duration_ms: totalDuration },
      { status: 500 }
    );
  }
}
