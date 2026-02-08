import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// GET: return last sync time
export async function GET() {
  const { data } = await supabase
    .from("pipeline_stats")
    .select("created_at, total_duration_ms, articles_ingested, articles_relevant")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json({
    last_sync: data?.created_at || null,
    duration_ms: data?.total_duration_ms || null,
    articles_ingested: data?.articles_ingested || 0,
    articles_relevant: data?.articles_relevant || 0,
  });
}
