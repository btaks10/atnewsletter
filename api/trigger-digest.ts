import type { VercelRequest, VercelResponse } from "@vercel/node";

async function callStep(
  baseUrl: string,
  path: string
): Promise<{ data: any; duration_ms: number }> {
  const start = Date.now();
  const response = await fetch(`${baseUrl}${path}`, { method: "POST" });
  const data = await response.json();
  return { data, duration_ms: Date.now() - start };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Auth: accept either Bearer token or Vercel cron header
  const authHeader = req.headers["authorization"];
  const cronHeader = req.headers["x-vercel-cron-signature"];
  const secret = process.env.TEST_TRIGGER_SECRET;

  const isBearerAuth = authHeader === `Bearer ${secret}`;
  const isCronAuth = !!cronHeader; // Vercel cron requests are trusted

  if (!isBearerAuth && !isCronAuth) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const startTotal = Date.now();

  // Determine base URL from request
  const protocol = req.headers["x-forwarded-proto"] || "https";
  const host = req.headers["host"];
  const baseUrl = `${protocol}://${host}`;

  try {
    // Step 1: Ingest
    const ingest = await callStep(baseUrl, "/api/ingest-articles");

    // Step 2: Analyze
    const analyze = await callStep(baseUrl, "/api/analyze-articles");

    // Step 3: Send digest
    const email = await callStep(baseUrl, "/api/send-digest");

    return res.status(200).json({
      success: true,
      ingest: ingest.data,
      analyze: analyze.data,
      email: email.data,
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
