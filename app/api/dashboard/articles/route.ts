import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { CATEGORY_ORDER } from "@/lib/config";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const date =
    searchParams.get("date") || new Date().toISOString().split("T")[0];
  const category = searchParams.get("category");
  const source = searchParams.get("source");
  const sourceType = searchParams.get("source_type");

  const startOfDay = `${date}T00:00:00.000Z`;
  const endOfDay = `${date}T23:59:59.999Z`;

  let query = supabase
    .from("article_analysis")
    .select(
      `
      id,
      article_id,
      is_relevant,
      summary,
      category,
      cluster_id,
      is_primary_in_cluster,
      analyzed_at,
      articles!inner (
        id,
        title,
        url,
        source,
        source_type,
        author,
        published_at
      )
    `
    )
    .eq("is_relevant", true)
    .gte("analyzed_at", startOfDay)
    .lte("analyzed_at", endOfDay);

  if (category) {
    query = query.eq("category", category);
  }
  if (source) {
    query = query.eq("articles.source", source);
  }
  if (sourceType) {
    query = query.eq("articles.source_type", sourceType);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Fetch feedback separately (more reliable than nested join)
  const articleIds = (data || []).map((row: any) => row.article_id);
  let feedbackMap = new Map<string, { feedback: string; notes: string | null }>();

  if (articleIds.length > 0) {
    const { data: feedbackData } = await supabase
      .from("article_feedback")
      .select("article_id, feedback, notes")
      .in("article_id", articleIds);

    feedbackMap = new Map(
      (feedbackData || []).map((f: any) => [
        f.article_id,
        { feedback: f.feedback, notes: f.notes },
      ])
    );
  }

  // Merge feedback and group by category
  const grouped: Record<string, any[]> = {};
  for (const cat of CATEGORY_ORDER) {
    grouped[cat] = [];
  }

  for (const row of data || []) {
    const cat = row.category || "Other";
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({
      ...row,
      feedback: feedbackMap.get(row.article_id) || null,
    });
  }

  // Remove empty categories
  for (const cat of Object.keys(grouped)) {
    if (grouped[cat].length === 0) delete grouped[cat];
  }

  // Collect unique sources for filter dropdown
  const sources = [
    ...new Set((data || []).map((row: any) => row.articles?.source).filter(Boolean)),
  ].sort();

  return NextResponse.json({
    date,
    total: data?.length || 0,
    sources,
    categories: grouped,
  });
}
