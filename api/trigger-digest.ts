import type { VercelRequest, VercelResponse } from "@vercel/node";
import { RSS_FEEDS } from "../lib/config";
import { runIngestion } from "../lib/rss";
import { runAnalysis } from "../lib/claude";
import { runClustering } from "../lib/story-clustering";
import { runDigest } from "../lib/email";
import { supabase } from "../lib/supabase";

export const config = { maxDuration: 60 };

const MAX_ANALYSIS_RETRIES = 3;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth: accept either Bearer token or Vercel cron header
  const authHeader = req.headers["authorization"];
  const cronHeader = req.headers["x-vercel-cron-signature"];
  const secret = process.env.TEST_TRIGGER_SECRET;

  const isBearerAuth = authHeader === `Bearer ${secret}`;
  const isCronAuth = !!cronHeader;

  if (!isBearerAuth && !isCronAuth) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const startTotal = Date.now();

  try {
    // Step 1: Ingest RSS feeds
    const ingest = await runIngestion(RSS_FEEDS);

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
      articles_ingested: ingest.new_articles_inserted,
      articles_keyword_passed: analyze?.keyword_filter?.passed_filter ?? 0,
      articles_analyzed: analyze?.claude_analysis?.articles_processed ?? 0,
      articles_relevant: analyze?.claude_analysis?.articles_relevant ?? 0,
      clusters_formed: clustering?.clusters_created ?? 0,
      email_sent: true,
      total_duration_ms: totalDuration,
    });

    return res.status(200).json({
      success: true,
      ingest,
      analyze,
      analysis_runs: analysisRuns,
      all_articles_processed: allProcessed,
      clustering,
      email,
      total_duration_ms: totalDuration,
    });
  } catch (err: any) {
    const totalDuration = Date.now() - startTotal;

    // Log failed pipeline run
    await supabase.from("pipeline_stats").insert({
      run_date: new Date().toISOString().split("T")[0],
      articles_ingested: 0,
      articles_keyword_passed: 0,
      articles_analyzed: 0,
      articles_relevant: 0,
      clusters_formed: 0,
      email_sent: false,
      total_duration_ms: totalDuration,
    });

    return res.status(500).json({
      success: false,
      error: err?.message || String(err),
      total_duration_ms: totalDuration,
    });
  }
}
