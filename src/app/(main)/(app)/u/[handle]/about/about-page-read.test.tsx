/**
 * /u/[handle]/about shares the profile page's read-failure split (via
 * loadMemberSubpage): private → calm private state, other 403 → denied,
 * 404 → notFound, anything else → the segment boundary, and a retired
 * handle 308s to the current one WITH the /about sub-path kept.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type ApiErrorBody } from "@/lib/api/types";

const getUser = vi.hoisted(() => vi.fn());
const NOT_FOUND = vi.hoisted(() => new Error("NEXT_NOT_FOUND"));
const redirectTo = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: async () => null }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/api/user-endpoints", () => ({ getUser }));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw NOT_FOUND;
  },
  permanentRedirect: (path: string) => {
    redirectTo(path);
    throw new Error("NEXT_REDIRECT");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import MemberAboutPage, { generateMetadata } from "./page";

afterEach(() => {
  cleanup();
  getUser.mockReset();
  redirectTo.mockReset();
});

function apiError(code: string, status: number, data?: Record<string, unknown>): BccApiError {
  const body: ApiErrorBody = {
    error: { code, message: "nope", status, ...(data !== undefined ? { data } : {}) },
    _meta: {} as ApiErrorBody["_meta"],
  };
  return new BccApiError(code, "nope", status, body);
}

const params = Promise.resolve({ handle: "alice" });

describe("about page — read failures", () => {
  it("profile_private renders the calm private state", async () => {
    getUser.mockRejectedValue(apiError("bcc_forbidden", 403, { reason: "profile_private" }));
    render(await MemberAboutPage({ params }));
    expect(screen.getByRole("status").textContent).toContain("This profile is private.");
  });

  it("bcc_permission_denied renders the denied state", async () => {
    getUser.mockRejectedValue(apiError("bcc_permission_denied", 403));
    render(await MemberAboutPage({ params }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("a 404 is notFound(); anything else throws to the boundary", async () => {
    getUser.mockRejectedValue(apiError("bcc_not_found", 404));
    await expect(MemberAboutPage({ params })).rejects.toBe(NOT_FOUND);
    const outage = apiError("bcc_unavailable", 503);
    getUser.mockRejectedValue(outage);
    await expect(MemberAboutPage({ params })).rejects.toBe(outage);
  });

  it("a retired handle redirects to the current handle's /about", async () => {
    getUser.mockResolvedValue({ handle: "alice-new" });
    await expect(MemberAboutPage({ params })).rejects.toThrow("NEXT_REDIRECT");
    expect(redirectTo).toHaveBeenCalledWith("/u/alice-new/about");
  });

  it("metadata titles a private profile as private", async () => {
    getUser.mockRejectedValue(apiError("bcc_forbidden", 403, { reason: "profile_private" }));
    expect((await generateMetadata({ params })).title).toBe("Private profile · Blue Collar Crypto");
  });
});
