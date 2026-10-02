/**
 * The sign-out POST must reach next-auth.
 *
 * `lib/auth/force-signout` is the last-resort control the render gate
 * offers when an ordinary teardown fails, and its whole mechanism is a
 * form POST to `/api/auth/signout` — the request that actually clears the
 * cookie. `/api/auth/signout` is in this middleware's matcher, so a
 * fall-through to the `!token` redirect would 307 that POST to `/login`
 * and leave the session intact. `getToken()` returns null for exactly the
 * sessions this control exists for: an expired or undecodable JWT whose
 * cookie is still present.
 */

import { describe, expect, it, vi } from "vitest";

const getToken = vi.fn<() => Promise<unknown>>();
vi.mock("next-auth/jwt", () => ({
  getToken: () => getToken(),
}));

import { NextRequest } from "next/server";

import { middleware } from "@/middleware";

function request(pathname: string, method: string) {
  // NextRequest, not Request: the middleware reads `nextUrl`.
  return new NextRequest(`http://localhost${pathname}`, { method });
}

describe("the sign-out route", () => {
  it("lets a POST through even with no decodable token", async () => {
    getToken.mockResolvedValue(null);
    const res = await middleware(request("/api/auth/signout", "POST"));
    // Not a redirect: a 307 to /login would re-POST to a page route (405)
    // and the cookie would never be cleared.
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });

  it("lets a POST through for a live session too", async () => {
    getToken.mockResolvedValue({ id: "1" });
    const res = await middleware(request("/api/auth/signout", "POST"));
    expect(res.headers.get("location")).toBeNull();
  });

  it("still sends a GET to the styled page", async () => {
    getToken.mockResolvedValue({ id: "1" });
    const res = await middleware(request("/api/auth/signout", "GET"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/signout");
  });

  it("still gates an ordinary protected route without a token", async () => {
    // Guards the fix from over-reaching.
    getToken.mockResolvedValue(null);
    const res = await middleware(request("/settings/profile", "GET"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});
