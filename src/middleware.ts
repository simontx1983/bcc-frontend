import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Redirect the default NextAuth GET sign-out page to our styled page.
  // withAuth skips its own /api/auth/* routes internally, so we handle
  // this redirect manually before any auth check.
  // POST requests (the actual sign-out mechanism) pass through untouched.
  if (pathname === "/api/auth/signout" && request.method === "GET") {
    return NextResponse.redirect(new URL("/signout", request.url));
  }

  const token = await getToken({ req: request });

  // Guest root → the marketing landing, served AT "/" via rewrite (not
  // redirect) so the URL bar and SEO root both stay "/" for everyone.
  // Authed "/" falls through unchanged to the (app) feed below — same
  // route, no rewrite needed, and it isn't otherwise auth-gated.
  if (pathname === "/") {
    if (!token) {
      return NextResponse.rewrite(new URL("/welcome", request.url));
    }
    return NextResponse.next();
  }

  // Protect the remaining matched routes — redirect unauthenticated users
  // to /login with a callbackUrl so they land back where they tried to go.
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/admin/:path*",
    "/api/auth/signout",
    "/messages/:path*",
    "/me/:path*",
    "/panel",
    "/settings/:path*",
    "/watching",
  ],
};
