import { NextResponse } from "next/server";
import { runClustering } from "@/lib/story-clustering";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runClustering();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}

export async function GET() {
  return POST();
}
