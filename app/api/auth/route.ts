import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";

export async function POST(request: NextRequest) {
  const { password } = await request.json();
  const dashboardPassword = process.env.DASHBOARD_PASSWORD;

  if (!dashboardPassword) {
    return NextResponse.json(
      { error: "DASHBOARD_PASSWORD not configured" },
      { status: 500 }
    );
  }

  if (password !== dashboardPassword) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = createHash("sha256")
    .update(dashboardPassword + (process.env.TEST_TRIGGER_SECRET || "salt"))
    .digest("hex");

  const response = NextResponse.json({ success: true });

  response.cookies.set("atnews-auth", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: "/",
  });

  return response;
}
