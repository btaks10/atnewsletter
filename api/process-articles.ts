import type { VercelRequest, VercelResponse } from "@vercel/node";
import { RSS_FEEDS } from "../lib/config";
import { runIngestion } from "../lib/rss";
import { runAnalysis } from "../lib/claude";
import { runClustering } from "../lib/story-clustering";

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Only allow cron or authenticated requests
  const authHeader = req.headers["authorization"];
  const cronHeader = req.headers["x-vercel-cron-signature"];
  const secret = process.env.TEST_TRIGGER_SECRET;

  if (authHeader !== `Bearer ${secret}` && !cronHeader) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const start = Date.now();

  try {
    const ingest = await runIngestion(RSS_FEEDS);

    let analyze;
    let analysisRuns = 0;
    let allProcessed = false;

    for (let attempt = 0; attempt < 3; attempt++) {
      analyze = await runAnalysis();
      analysisRuns++;
      if (analyze.remaining_unanalyzed === 0) {
        allProcessed = true;
        break;
      }
    }

    let clustering;
    try {
      clustering = await runClustering();
    } catch (err: any) {
      console.error(`Clustering failed, continuing without: ${err?.message}`);
      clustering = { skipped: true, reason: `Error: ${err?.message}` };
    }

    return res.status(200).json({
      success: true,
      ingest,
      analyze,
      analysis_runs: analysisRuns,
      all_articles_processed: allProcessed,
      clustering,
      duration_ms: Date.now() - start,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || String(err),
      duration_ms: Date.now() - start,
    });
  }
}
