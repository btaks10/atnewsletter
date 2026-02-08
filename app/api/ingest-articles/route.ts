import { NextResponse } from "next/server";
import { getActiveFeeds } from "@/lib/config";
import { runIngestion } from "@/lib/rss";

export const maxDuration = 60;

export async function POST() {
  try {
    const feeds = await getActiveFeeds();
    const result = await runIngestion(feeds);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
