import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../lib/supabase";
import { sendDigest } from "../lib/email";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data, error: fetchError } = await supabase
    .from("article_analysis")
    .select(
      `
      summary,
      category,
      articles!inner (
        title,
        url,
        source,
        author,
        published_at
      )
    `
    )
    .eq("is_relevant", true)
    .gte("analyzed_at", cutoff);

  if (fetchError) {
    return res.status(500).json({ success: false, error: fetchError.message });
  }

  const articles = (data || []).map((row: any) => ({
    title: row.articles.title,
    url: row.articles.url,
    source: row.articles.source,
    author: row.articles.author,
    published_at: row.articles.published_at,
    summary: row.summary,
    category: row.category,
  }));

  try {
    const result = await sendDigest(articles);

    await supabase.from("digest_logs").insert({
      recipient: result.recipient,
      articles_included: result.articles_included,
      resend_message_id: result.resend_message_id,
      status: "success",
    });

    return res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    const errorMessage = err?.message || String(err);

    await supabase.from("digest_logs").insert({
      recipient: process.env.EMAIL_RECIPIENT || "bryan@notionstate.com",
      articles_included: articles.length,
      status: "failure",
      error_message: errorMessage,
    });

    return res.status(500).json({ success: false, error: errorMessage });
  }
}
