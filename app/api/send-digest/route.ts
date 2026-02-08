import { NextResponse } from "next/server";
import { runDigest } from "@/lib/email";
import { supabase } from "@/lib/supabase";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runDigest();

    // Log pipeline stats so dashboard "Last sync" updates
    const today = new Date().toISOString().split("T")[0];
    const { count: ingested } = await supabase
      .from("articles")
      .select("*", { count: "exact", head: true })
      .gte("found_at", today);
    const { count: relevant } = await supabase
      .from("article_analysis")
      .select("*", { count: "exact", head: true })
      .eq("is_relevant", true)
      .gte("created_at", today);

    await supabase.from("pipeline_stats").insert({
      run_date: today,
      articles_ingested: ingested ?? 0,
      articles_relevant: relevant ?? 0,
      total_duration_ms: 0,
      email_sent: true,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err: any) {
    const errorMessage = err?.message || String(err);

    await supabase.from("digest_logs").insert({
      recipient: process.env.EMAIL_RECIPIENT || "bryan@notionstate.com",
      articles_included: 0,
      status: "failure",
      error_message: errorMessage,
    });

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
