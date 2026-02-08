import { NextResponse } from "next/server";
import { RSS_FEEDS } from "@/lib/config";
import { runIngestion } from "@/lib/rss";

export async function POST() {
  try {
    const result = await runIngestion(RSS_FEEDS);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
