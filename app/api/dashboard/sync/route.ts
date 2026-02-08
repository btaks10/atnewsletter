import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

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

// POST: trigger a pipeline run
export async function POST() {
  const secret = process.env.TEST_TRIGGER_SECRET;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  const res = await fetch(`${baseUrl}/api/trigger-digest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  });

  const result = await res.json();

  if (!res.ok) {
    return NextResponse.json(
      { error: result.error || "Pipeline failed" },
      { status: 500 }
    );
  }

  return NextResponse.json(result);
}
