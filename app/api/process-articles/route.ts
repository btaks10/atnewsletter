import { NextRequest, NextResponse } from "next/server";
import { getActiveFeeds } from "@/lib/config";
import { runIngestion } from "@/lib/rss";
import { runAnalysis } from "@/lib/claude";
import { runClustering } from "@/lib/story-clustering";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronHeader = request.headers.get("x-vercel-cron-signature");
  const secret = process.env.TEST_TRIGGER_SECRET;

  if (authHeader !== `Bearer ${secret}` && !cronHeader) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const start = Date.now();

  try {
    const feeds = await getActiveFeeds();
    const ingest = await runIngestion(feeds);

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

    return NextResponse.json({
      success: true,
      ingest,
      analyze,
      analysis_runs: analysisRuns,
      all_articles_processed: allProcessed,
      clustering,
      duration_ms: Date.now() - start,
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err), duration_ms: Date.now() - start },
      { status: 500 }
    );
  }
}
