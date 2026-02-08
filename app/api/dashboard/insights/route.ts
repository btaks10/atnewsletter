import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "7", 10);
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000
  ).toISOString();

  // 1. Pipeline stats over time
  const { data: pipelineStats } = await supabase
    .from("pipeline_stats")
    .select("*")
    .gte("created_at", since)
    .order("created_at", { ascending: true });

  // 2. Category breakdown
  const { data: categoryData } = await supabase
    .from("article_analysis")
    .select("category")
    .eq("is_relevant", true)
    .gte("analyzed_at", since);

  const categoryBreakdown: Record<string, number> = {};
  for (const row of categoryData || []) {
    const cat = row.category || "Other";
    categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) + 1;
  }

  // 3. Source breakdown
  const { data: sourceData } = await supabase
    .from("article_analysis")
    .select("articles!inner(source, source_type)")
    .eq("is_relevant", true)
    .gte("analyzed_at", since);

  const sourceBreakdown: Record<string, number> = {};
  const sourceTypeBreakdown: Record<string, number> = {};
  for (const row of sourceData || []) {
    const src = (row as any).articles?.source || "Unknown";
    const srcType = (row as any).articles?.source_type || "rss";
    sourceBreakdown[src] = (sourceBreakdown[src] || 0) + 1;
    sourceTypeBreakdown[srcType] = (sourceTypeBreakdown[srcType] || 0) + 1;
  }

  // 4. Feedback summary
  const { data: feedbackData } = await supabase
    .from("article_feedback")
    .select("feedback")
    .gte("created_at", since);

  const feedbackSummary = {
    total: feedbackData?.length || 0,
    relevant:
      feedbackData?.filter((f: any) => f.feedback === "relevant").length || 0,
    not_relevant:
      feedbackData?.filter((f: any) => f.feedback === "not_relevant").length ||
      0,
  };

  return NextResponse.json({
    days,
    pipeline_stats: pipelineStats || [],
    category_breakdown: categoryBreakdown,
    source_breakdown: sourceBreakdown,
    source_type_breakdown: sourceTypeBreakdown,
    feedback_summary: feedbackSummary,
  });
}
