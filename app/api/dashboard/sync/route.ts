import { NextRequest, NextResponse } from "next/server";
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

// POST: log pipeline stats after multi-stage sync
export async function POST(request: NextRequest) {
  const body = await request.json();

  await supabase.from("pipeline_stats").insert({
    run_date: new Date().toISOString().split("T")[0],
    articles_ingested: body.articles_ingested || 0,
    articles_relevant: body.articles_relevant || 0,
    total_duration_ms: body.duration_ms || 0,
    email_sent: false,
  });

  return NextResponse.json({ success: true });
}
