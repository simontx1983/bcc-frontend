/**
 * F-332 (D): the recovery-email nudge is mounted in the own-profile header
 * for the OWNER only, and links to the owner's own Account tab (no /u/me
 * redirect hop). A visitor's profile view never carries it.
 *
 * The page is a server component, so this walks the element tree it
 * returns rather than rendering every child; the nudge itself (what it
 * shows, and when it shows nothing) is covered in
 * components/settings/recovery-email-nudge.test.tsx.
 */

import { isValidElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ current: null as unknown }));
const getUser = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({ getServerSession: async () => session.current }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/api/user-endpoints", () => ({ getUser }));
vi.mock("@/lib/api/me-reliability-endpoints", () => ({
  getMeReliability: async () => {
    throw new Error("not needed here");
  },
}));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  permanentRedirect: () => {
    throw new Error("NEXT_REDIRECT");
  },
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/components/settings/RecoveryEmailNudge", () => ({
  RecoveryEmailNudge: function RecoveryEmailNudgeMarker() {
    return null;
  },
}));

import { RecoveryEmailNudge } from "@/components/settings/RecoveryEmailNudge";

import { TrustHeader } from "@/components/profile/TrustHeader";

import MemberProfilePage from "./page";

afterEach(() => {
  getUser.mockReset();
  session.current = null;
});

const profile = {
  user_id: 42,
  handle: "alice",
  display_name: "Alice",
  bio: "",
  joined_at: "2026-01-01T00:00:00Z",
  reputation_score: 50,
  trust_score: 50,
  halls: [],
  wallets: [],
  flags: {},
  avatar_url: null,
  viewer_is_watching: false,
  viewer_attestation: null,
  permissions: { can_stand_behind: { allowed: false }, can_report: { allowed: false } },
  card: { id: 9, permissions: {}, review_target_id: 7, viewer_has_reviewed: false },
  counts: { reviews_received: 0, reviews_written: 0 },
};

function signedInAs(handle: string) {
  session.current = { bccToken: "t", user: { id: "1", handle } };
}

/** Every element of a given component type in a returned tree. */
function findAll(node: ReactNode, type: unknown): Array<{ props: Record<string, unknown> }> {
  const out: Array<{ props: Record<string, unknown> }> = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (!isValidElement(n)) return;
    const props = n.props as Record<string, unknown>;
    if (n.type === type) out.push({ props });
    walk(props["children"]);
  };
  walk(node);
  return out;
}

async function renderTree(): Promise<ReactNode> {
  getUser.mockResolvedValue(profile);
  return MemberProfilePage({
    params: Promise.resolve({ handle: "alice" }),
    searchParams: Promise.resolve({}),
  });
}

describe("profile page: recovery-email nudge mount", () => {
  it("the owner gets it, linked to their own Account tab", async () => {
    signedInAs("alice");
    const nudges = findAll(await renderTree(), RecoveryEmailNudge);
    expect(nudges).toHaveLength(1);
    expect(nudges[0]?.props["href"]).toBe("/u/alice?tab=account");
  });

  it("a signed-in visitor does not", async () => {
    signedInAs("bob");
    expect(findAll(await renderTree(), RecoveryEmailNudge)).toHaveLength(0);
  });
});

describe("F-565 — the profile page has a top-level heading", () => {
  it("the trust header renders the member's name as the page's <h1>", async () => {
    signedInAs("bob");
    const headers = findAll(await renderTree(), TrustHeader);
    expect(headers).toHaveLength(1);
    expect(headers[0]?.props["nameAs"]).toBe("h1");
  });
});
