/**
 * The profile robots tag is the server's own `indexable` (contract v1.228,
 * F-518), never a reading of `flags`. Since trust #902 (F-582) every viewer
 * but the member and admins receives `flags: []`, a crawler included, so
 * "empty flags → index it" would index the very accounts flags exist to
 * keep out. Pinned on the profile page and on its subpages, in the
 * indexable deployment (so only the profile gate decides).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.hoisted(() => vi.fn());

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
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));

import { generateMetadata } from "./page";
import { memberSubpageMetadata } from "@/lib/profile/load-member-subpage";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  getUser.mockReset();
  // The indexable deployment, so the PROFILE gate is the one deciding.
  process.env["VERCEL_ENV"] = "production";
  process.env["NEXTAUTH_URL"] = "https://bluecollarcrypto.io";
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function profile(over: Record<string, unknown>) {
  return {
    id: 7,
    handle: "alice",
    display_name: "Alice",
    bio: "Runs a validator.",
    flags: [],
    ...over,
  };
}

const noindexed = (meta: { robots?: unknown }) =>
  JSON.stringify(meta.robots ?? null).includes('"index":false');

const surfaces: Array<[string, () => Promise<{ robots?: unknown }>]> = [
  ["the profile page", () => generateMetadata({ params: Promise.resolve({ handle: "alice" }) }) as Promise<{ robots?: unknown }>],
  ["a profile subpage", () => memberSubpageMetadata("alice", "about", "About") as Promise<{ robots?: unknown }>],
];

describe.each(surfaces)("%s", (_label, meta) => {
  it("flags [] but indexable false → noindex (empty flags mean nothing)", async () => {
    getUser.mockResolvedValue(profile({ flags: [], indexable: false }));
    expect(noindexed(await meta())).toBe(true);
  });

  it("indexable absent → noindex (fail closed)", async () => {
    getUser.mockResolvedValue(profile({ flags: [] }));
    expect(noindexed(await meta())).toBe(true);
  });

  it("indexable true → indexed", async () => {
    getUser.mockResolvedValue(profile({ flags: [], indexable: true }));
    expect(noindexed(await meta())).toBe(false);
  });

  it("the server's answer wins: flags are never consulted", async () => {
    getUser.mockResolvedValue(profile({ flags: ["suspended"], indexable: true }));
    expect(noindexed(await meta())).toBe(false);
  });

  it("only exactly true indexes", async () => {
    getUser.mockResolvedValue(profile({ flags: [], indexable: "true" }));
    expect(noindexed(await meta())).toBe(true);
  });
});
