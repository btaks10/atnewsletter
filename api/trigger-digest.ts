import type { VercelRequest, VercelResponse } from "@vercel/node";
import { RSS_FEEDS } from "../lib/config";
import { runIngestion } from "../lib/rss";
import { runAnalysis } from "../lib/claude";
import { runDigest } from "../lib/email";

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

    // Step 2: Analyze with Claude
    const analyze = await runAnalysis();

    // Step 3: Send email digest
    const email = await runDigest();

    return res.status(200).json({
      success: true,
      ingest,
      analyze,
      email,
      total_duration_ms: Date.now() - startTotal,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      error: err?.message || String(err),
      total_duration_ms: Date.now() - startTotal,
    });
  }
}
