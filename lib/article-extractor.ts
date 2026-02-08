import { supabase } from "./supabase";

const MAX_CONCURRENT = 5;
const FETCH_TIMEOUT_MS = 5000;
const MAX_TEXT_LENGTH = 5000;
const MAX_ENRICHMENTS_PER_RUN = 20;

/**
 * Fetch full article text from a URL by extracting <p> tag content.
 * Returns null if fetch fails or no meaningful text found.
 */
async function fetchFullText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; ATNewsBot/1.0; +https://atnewsletter.vercel.app)",
        Accept: "text/html",
      },
      redirect: "follow",
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const html = await res.text();

    // Extract text from <p> tags (handles most news articles)
    const paragraphs = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) || [];
    const text = paragraphs
      .map((p) =>
        p
          .replace(/<[^>]*>/g, "") // strip HTML tags
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, " ")
          .trim()
      )
      .filter((t) => t.length > 40) // skip short nav/footer fragments
      .join("\n\n");

    return text.length > 100 ? text.slice(0, MAX_TEXT_LENGTH) : null;
  } catch {
    return null;
  }
}

/**
 * Enrich recently ingested articles that have short/missing content
 * by fetching full text from their URLs. Call after ingestion.
 */
export async function enrichArticleContent(): Promise<{
  attempted: number;
  enriched: number;
}> {
  // Find recent articles with short content (< 300 chars)
  const cutoff = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // last 2 hours
  const { data: articles } = await supabase
    .from("articles")
    .select("id, url, raw_content")
    .eq("analyzed", false)
    .gte("fetched_at", cutoff)
    .order("fetched_at", { ascending: false })
    .limit(MAX_ENRICHMENTS_PER_RUN);

  if (!articles || articles.length === 0) {
    return { attempted: 0, enriched: 0 };
  }

  // Filter to articles with short/missing content
  const needsEnrichment = articles.filter(
    (a) => !a.raw_content || a.raw_content.length < 300
  );

  let enriched = 0;

  // Process in batches of MAX_CONCURRENT
  for (let i = 0; i < needsEnrichment.length; i += MAX_CONCURRENT) {
    const batch = needsEnrichment.slice(i, i + MAX_CONCURRENT);
    const results = await Promise.allSettled(
      batch.map(async (article) => {
        const fullText = await fetchFullText(article.url);
        if (fullText && fullText.length > (article.raw_content?.length || 0)) {
          await supabase
            .from("articles")
            .update({ raw_content: fullText })
            .eq("id", article.id);
          return true;
        }
        return false;
      })
    );

    for (const r of results) {
      if (r.status === "fulfilled" && r.value) enriched++;
    }
  }

  return { attempted: needsEnrichment.length, enriched };
}
