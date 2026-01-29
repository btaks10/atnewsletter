import type { VercelRequest, VercelResponse } from "@vercel/node";
import { supabase } from "../lib/supabase";
import { analyzeArticle } from "../lib/claude";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: articles, error: fetchError } = await supabase
    .from("articles")
    .select("*")
    .eq("analyzed", false)
    .gte("fetched_at", cutoff);

  if (fetchError) {
    return res.status(500).json({ success: false, error: fetchError.message });
  }

  if (!articles || articles.length === 0) {
    return res.status(200).json({
      success: true,
      articles_processed: 0,
      articles_relevant: 0,
      articles_not_relevant: 0,
      errors: [],
    });
  }

  let relevant = 0;
  let notRelevant = 0;
  const errors: string[] = [];

  for (const article of articles) {
    try {
      const { result, model } = await analyzeArticle(
        article.title,
        article.source,
        article.raw_content
      );

      await supabase.from("article_analysis").insert({
        article_id: article.id,
        is_relevant: result.is_relevant,
        summary: result.summary,
        category: result.category,
        model_used: model,
      });

      await supabase
        .from("articles")
        .update({ analyzed: true })
        .eq("id", article.id);

      if (result.is_relevant) {
        relevant++;
      } else {
        notRelevant++;
      }
    } catch (err: any) {
      const msg = `Article "${article.title}": ${err?.message || String(err)}`;
      errors.push(msg);

      // Mark as analyzed to avoid retrying broken articles forever
      await supabase
        .from("articles")
        .update({ analyzed: true })
        .eq("id", article.id);
    }
  }

  return res.status(200).json({
    success: true,
    articles_processed: articles.length,
    articles_relevant: relevant,
    articles_not_relevant: notRelevant,
    errors,
  });
}
