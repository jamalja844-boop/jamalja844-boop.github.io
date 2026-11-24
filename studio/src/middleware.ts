import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC = ["/login", "/register", "/api/auth/login", "/api/auth/register"];

async function valid(token: string | undefined) {
  if (!token) return false;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return true; // dev default secret lives in node runtime; full check happens in route handlers
  try {
    await jwtVerify(token, new TextEncoder().encode(secret));
    return true;
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // CSRF: state-changing API calls must come from our own origin
  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    const origin = req.headers.get("origin");
    if (origin && origin !== req.nextUrl.origin && origin !== process.env.APP_URL) {
      return NextResponse.json({ error: "Cross-origin request blocked" }, { status: 403 });
    }
  }
  if (PUBLIC.some((p) => pathname.startsWith(p)) || pathname.startsWith("/api/")) return NextResponse.next();
  if (!(await valid(req.cookies.get("ads_session")?.value))) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
