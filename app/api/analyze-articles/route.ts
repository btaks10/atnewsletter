import { NextResponse } from "next/server";
import { runAnalysis } from "@/lib/claude";

export const maxDuration = 60;

export async function POST() {
  try {
    const result = await runAnalysis();
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err?.message || String(err) },
      { status: 500 }
    );
  }
}
