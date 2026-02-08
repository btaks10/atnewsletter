import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { name, url, type } = body;

  if (!name || !url || !type) {
    return NextResponse.json(
      { error: "name, url, and type are required" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("rss_feeds")
    .insert({ name, url, type })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}
