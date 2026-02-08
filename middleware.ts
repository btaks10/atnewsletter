import { NextRequest, NextResponse } from "next/server";

const PUBLIC_PATHS = [
  "/api/trigger-digest",
  "/api/process-articles",
  "/api/ingest-articles",
  "/api/ingest-gnews",
  "/api/analyze-articles",
  "/api/send-digest",
  "/api/auth",
  "/login",
];

async function sha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public paths
  if (PUBLIC_PATHS.some((p) => pathname === p)) {
    return NextResponse.next();
  }

  // Skip static assets and Next.js internals
  if (pathname.startsWith("/_next") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  const token = request.cookies.get("atnews-auth")?.value;
  const dashboardPassword = process.env.DASHBOARD_PASSWORD;

  if (!dashboardPassword || !token) {
    // For API routes, return 401 instead of redirect
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const expectedToken = await sha256(
    dashboardPassword + (process.env.TEST_TRIGGER_SECRET || "salt")
  );

  if (token !== expectedToken) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
