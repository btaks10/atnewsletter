import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  const { article_id, feedback, notes } = await request.json();

  if (!article_id || !feedback) {
    return NextResponse.json(
      { error: "article_id and feedback are required" },
      { status: 400 }
    );
  }

  if (feedback !== "relevant" && feedback !== "not_relevant") {
    return NextResponse.json(
      { error: "feedback must be 'relevant' or 'not_relevant'" },
      { status: 400 }
    );
  }

  const { data, error } = await supabase
    .from("article_feedback")
    .upsert(
      {
        article_id,
        feedback,
        notes: notes || null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "article_id" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, feedback: data });
}

export async function DELETE(request: NextRequest) {
  const { article_id } = await request.json();

  if (!article_id) {
    return NextResponse.json(
      { error: "article_id is required" },
      { status: 400 }
    );
  }

  const { error } = await supabase
    .from("article_feedback")
    .delete()
    .eq("article_id", article_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
