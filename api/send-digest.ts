import type { VercelRequest, VercelResponse } from "@vercel/node";
import { runDigest } from "../lib/email";
import { supabase } from "../lib/supabase";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const result = await runDigest();
    return res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    const errorMessage = err?.message || String(err);

    await supabase.from("digest_logs").insert({
      recipient: process.env.EMAIL_RECIPIENT || "bryan@notionstate.com",
      articles_included: 0,
      status: "failure",
      error_message: errorMessage,
    });

    return res.status(500).json({ success: false, error: errorMessage });
  }
}
