import { NextResponse } from "next/server";
import { runDigest } from "@/lib/email";
import { supabase } from "@/lib/supabase";

export async function POST() {
  try {
    const result = await runDigest();
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
