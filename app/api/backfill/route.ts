import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { normalizeTitle, jaccardSimilarity } from "@/lib/dedup";

export async function POST() {
  try {
    const results = {
      google_news_fixed: 0,
      international_flagged: 0,
      duplicates_marked: 0,
      errors: [] as string[],
    };

    // --- Step 1: Fix Google News source labels ---
    const { data: gnFeeds } = await supabase
      .from("rss_feeds")
      .select("name")
      .ilike("url", "%news.google.com%");

    if (gnFeeds && gnFeeds.length > 0) {
      const feedNames = gnFeeds.map((f: any) => f.name);

      const { data: gnArticles } = await supabase
        .from("articles")
        .select("id, title, source")
        .in("source", feedNames)
        .eq("source_type", "rss");

      if (gnArticles) {
        for (const article of gnArticles) {
          const lastDash = article.title.lastIndexOf(" - ");
          if (lastDash === -1) continue;

          const cleanedTitle = article.title.slice(0, lastDash).trim();
          const publisher = article.title.slice(lastDash + 3).trim();

          if (!cleanedTitle || !publisher) continue;

          const { error } = await supabase
            .from("articles")
            .update({ title: cleanedTitle, source: publisher })
            .eq("id", article.id);

          if (error) {
            results.errors.push(`GN fix ${article.id}: ${error.message}`);
          } else {
            results.google_news_fixed++;
          }
        }
      }
    }

    // --- Step 2: Set is_international for "International" category ---
    const { count: intlCount } = await supabase
      .from("article_analysis")
      .select("*", { count: "exact", head: true })
      .eq("category", "International")
      .eq("is_international", false);

    const { error: intlError } = await supabase
      .from("article_analysis")
      .update({ is_international: true })
      .eq("category", "International")
      .eq("is_international", false);

    if (intlError) {
      results.errors.push(`INTL flag: ${intlError.message}`);
    } else {
      results.international_flagged = intlCount ?? 0;
    }

    // --- Step 3: Mark duplicates ---
    const { data: allArticles } = await supabase
      .from("articles")
      .select("id, title, fetched_at")
      .is("duplicate_of", null)
      .order("fetched_at", { ascending: true });

    if (allArticles && allArticles.length > 0) {
      const normalized = allArticles.map((a: any) => ({
        id: a.id,
        norm: normalizeTitle(a.title),
      }));

      const duplicateUpdates: { id: string; duplicate_of: string }[] = [];

      for (let i = 1; i < normalized.length; i++) {
        if (normalized[i].norm.split(" ").length < 3) continue;

        for (let j = 0; j < i; j++) {
          // Skip if the earlier article is already a duplicate itself
          if (duplicateUpdates.some((d) => d.id === normalized[j].id)) continue;

          const sim = jaccardSimilarity(normalized[i].norm, normalized[j].norm);
          if (sim > 0.85) {
            duplicateUpdates.push({
              id: normalized[i].id,
              duplicate_of: normalized[j].id,
            });
            break; // Found a match, move to next article
          }
        }
      }

      for (const dup of duplicateUpdates) {
        const { error } = await supabase
          .from("articles")
          .update({ duplicate_of: dup.duplicate_of })
          .eq("id", dup.id);

        if (error) {
          results.errors.push(`Dedup ${dup.id}: ${error.message}`);
        } else {
          results.duplicates_marked++;
        }
      }
    }

    return NextResponse.json({ success: true, ...results });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
