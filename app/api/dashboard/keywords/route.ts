import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { keyword, tier } = body;

  if (!keyword || !tier) {
    return NextResponse.json(
      { error: "keyword and tier are required" },
      { status: 400 }
    );
  }

  if (!["primary", "secondary", "context"].includes(tier)) {
    return NextResponse.json(
      { error: "tier must be primary, secondary, or context" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("keyword_config")
    .insert({ keyword: keyword.toLowerCase().trim(), tier })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
