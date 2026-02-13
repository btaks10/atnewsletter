import { supabase } from "./supabase";
import { getArticleAgeCutoff } from "./config";

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(
      /^(breaking|exclusive|opinion|analysis|report|updated|watch|listen|video|photos?)\s*:\s*/i,
      ""
    )
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function jaccardSimilarity(a: string, b: string): number {
  const setA = new Set(a.split(" ").filter(Boolean));
  const setB = new Set(b.split(" ").filter(Boolean));
  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export async function findDuplicate(title: string): Promise<string | null> {
  const normalized = normalizeTitle(title);
  if (normalized.split(" ").length < 3) return null;

  const cutoff = getArticleAgeCutoff();
  const { data: recent } = await supabase
    .from("articles")
    .select("id, title")
    .is("duplicate_of", null)
    .gte("fetched_at", cutoff);

  if (!recent || recent.length === 0) return null;

  for (const article of recent) {
    const sim = jaccardSimilarity(normalized, normalizeTitle(article.title));
    if (sim > 0.85) return article.id;
  }

  return null;
}
