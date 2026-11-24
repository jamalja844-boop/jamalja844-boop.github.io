import { NextResponse, type NextRequest } from "next/server";

/** Snelle doorverwijzing naar /login als er geen sessiecookie is. Volledige validatie gebeurt server-side. */
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("studio_session") || req.cookies.has("__Host-studio_session");
  if (!hasSession && req.nextUrl.pathname.startsWith("/w/")) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(req.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/w/:path*"] };
