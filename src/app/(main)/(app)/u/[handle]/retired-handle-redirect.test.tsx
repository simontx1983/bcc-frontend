/**
 * bcc-trust #540 / #557: `GET /users/:handle` resolves a RETIRED handle (or
 * `member-{id}`) to the member and always returns their CURRENT `handle`.
 * The profile page then 308s to `/u/<current>` with the query kept, and
 * renders in place when the URL already uses the current handle (which is
 * every request on a backend without #540/#557).
 */

import { afterEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());
const permanentRedirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  }),
);

vi.mock("next-auth", () => ({ getServerSession: async () => null }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/api/user-endpoints", () => ({ getUser }));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import MemberProfilePage from "./page";

afterEach(() => {
  getUser.mockReset();
  permanentRedirect.mockClear();
});

function run(handle: string, query: Record<string, string> = {}) {
  return MemberProfilePage({
    params: Promise.resolve({ handle }),
    searchParams: Promise.resolve(query),
  });
}

/** Run the page and report only whether (and where) it redirected. */
async function redirectOf(handle: string, query: Record<string, string> = {}) {
  try {
    await run(handle, query);
  } catch (err) {
    const path = (err as { path?: string }).path;
    if (path !== undefined) return path;
    // Any other failure is past the redirect decision; that is all this
    // file is about.
  }
  return null;
}

describe("profile page: retired handle → 308 to the current handle", () => {
  it("a retired handle redirects permanently, query kept", async () => {
    getUser.mockResolvedValue({ handle: "alice" });
    expect(await redirectOf("alice_login", { tab: "profile", focus: "bio" })).toBe(
      "/u/alice?tab=profile&focus=bio",
    );
    expect(permanentRedirect).toHaveBeenCalledTimes(1);
  });

  it("the current handle renders in place (also: any backend without #540)", async () => {
    getUser.mockResolvedValue({ handle: "alice" });
    expect(await redirectOf("alice")).toBeNull();
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("a case-only difference renders in place", async () => {
    getUser.mockResolvedValue({ handle: "alice" });
    expect(await redirectOf("ALICE")).toBeNull();
    expect(permanentRedirect).not.toHaveBeenCalled();
  });

  it("a failed read never redirects", async () => {
    getUser.mockRejectedValue(new Error("down"));
    await expect(run("alice_login")).rejects.toThrow("down");
    expect(permanentRedirect).not.toHaveBeenCalled();
  });
});
