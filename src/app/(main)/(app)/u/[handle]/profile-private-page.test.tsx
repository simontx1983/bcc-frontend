/**
 * F-02 (contract v1.91) — the profile page's read-failure classification.
 *
 * `GET /users/:handle` has two 403s. `bcc_forbidden` + reason
 * `profile_private` is the owner's choice and renders the calm private
 * state; `bcc_permission_denied` is the viewer's own standing and stays the
 * "denied" state. A 404 is still `notFound()`, anything else still throws to
 * the segment boundary. The page and its metadata are run for real against
 * a stubbed `getUser`.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type ApiErrorBody } from "@/lib/api/types";

const getUser = vi.hoisted(() => vi.fn());
const NOT_FOUND = vi.hoisted(() => new Error("NEXT_NOT_FOUND"));

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
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

import MemberProfilePage, { generateMetadata } from "./page";

afterEach(() => {
  cleanup();
  getUser.mockReset();
});

function apiError(code: string, status: number, data?: Record<string, unknown>): BccApiError {
  const body: ApiErrorBody = {
    error: { code, message: "Account suspended.", status, ...(data !== undefined ? { data } : {}) },
    _meta: {} as ApiErrorBody["_meta"],
  };
  return new BccApiError(code, "Account suspended.", status, body);
}

const params = Promise.resolve({ handle: "alice" });

async function renderPage() {
  const ui = await MemberProfilePage({ params });
  return render(ui);
}

describe("profile page — read failures", () => {
  it("profile_private renders the calm private state, no alert, no retry", async () => {
    getUser.mockRejectedValue(apiError("bcc_forbidden", 403, { reason: "profile_private" }));
    await renderPage();
    expect(screen.getByRole("status").textContent).toContain("This profile is private.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("bcc_permission_denied still renders the denied state", async () => {
    getUser.mockRejectedValue(apiError("bcc_permission_denied", 403));
    await renderPage();
    expect(screen.getByRole("alert").textContent).toMatch(/isn't available to you/i);
    expect(screen.queryByTestId("profile-private")).toBeNull();
    // The server's moderation message never renders.
    expect(document.body.textContent ?? "").not.toContain("Account suspended");
  });

  it("bcc_forbidden WITHOUT the reason is the denied state, not private", async () => {
    getUser.mockRejectedValue(apiError("bcc_forbidden", 403));
    await renderPage();
    expect(screen.queryByTestId("profile-private")).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("a 404 is still notFound()", async () => {
    getUser.mockRejectedValue(apiError("bcc_not_found", 404));
    await expect(MemberProfilePage({ params })).rejects.toBe(NOT_FOUND);
  });

  it("anything else still throws to the segment boundary", async () => {
    const outage = apiError("bcc_unavailable", 503);
    getUser.mockRejectedValue(outage);
    await expect(MemberProfilePage({ params })).rejects.toBe(outage);
  });
});

describe("profile metadata — read failures", () => {
  it("titles a private profile as private", async () => {
    getUser.mockRejectedValue(apiError("bcc_forbidden", 403, { reason: "profile_private" }));
    const meta = await generateMetadata({ params });
    expect(meta.title).toBe("Private profile · Blue Collar Crypto");
  });

  it("keeps 'Profile not found' for every other failure", async () => {
    getUser.mockRejectedValue(apiError("bcc_not_found", 404));
    expect((await generateMetadata({ params })).title).toBe("Profile not found · Blue Collar Crypto");
    getUser.mockRejectedValue(apiError("bcc_permission_denied", 403));
    expect((await generateMetadata({ params })).title).toBe("Profile not found · Blue Collar Crypto");
  });
});
