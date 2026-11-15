import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api") || pathname.startsWith("/dev") || pathname.startsWith("/_next")) return NextResponse.next();
  const signedIn = Boolean(request.cookies.get("tally_session")?.value);
  if (!signedIn && pathname !== "/login") return NextResponse.redirect(new URL("/login", request.url));
  if (signedIn && pathname === "/login") return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon).*)"],
};
