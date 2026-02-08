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

// POST: fire-and-forget pipeline trigger, returns immediately
export async function POST() {
  const secret = process.env.TEST_TRIGGER_SECRET;
  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

  // Fire and forget — trigger-digest runs as a separate serverless invocation
  fetch(`${baseUrl}/api/trigger-digest`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
    },
  }).catch(() => {
    // Pipeline runs independently; errors are logged in pipeline_stats
  });

  return NextResponse.json({ status: "started" });
}
