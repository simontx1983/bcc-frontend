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

  // Protect the remaining matched routes — redirect unauthenticated users
  // to /login with a callbackUrl so they land back where they tried to go.
  const token = await getToken({ req: request });
  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/auth/signout",
    "/messages/:path*",
    "/me/:path*",
    "/panel",
    "/settings/:path*",
    "/watching",
  ],
};
