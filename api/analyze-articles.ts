import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runAnalysis } from "../lib/claude";

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await runAnalysis();
    return res.status(200).json(result);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || String(err) });
  }
}
