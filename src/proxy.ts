import { NextResponse, type NextRequest } from "next/server";
import { AUTH_COOKIE, isAuthCookieValid } from "@/lib/auth";

export const config = {
  // Everything except the login page/route, Next internals, and static assets.
  matcher: [
    "/((?!login|api/auth/login|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};

export function proxy(request: NextRequest) {
  const cookie = request.cookies.get(AUTH_COOKIE)?.value;
  if (isAuthCookieValid(cookie)) {
    return NextResponse.next();
  }

  if (request.nextUrl.pathname.startsWith("/api/")) {
    return Response.json(
      { error: "Unauthorized. Sign in at /login." },
      { status: 401 },
    );
  }

  const loginUrl = new URL("/login", request.url);
  const next = request.nextUrl.pathname + request.nextUrl.search;
  if (next !== "/") loginUrl.searchParams.set("next", next);
  return NextResponse.redirect(loginUrl);
}
