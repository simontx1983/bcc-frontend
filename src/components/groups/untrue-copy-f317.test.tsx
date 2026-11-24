/**
 * F-317 M-gr5 (+ the #365 review's INFO 1) — copy in the groups surfaces
 * that said something untrue.
 *
 *   - Hall ranked feed: "Journeyman and above post here." named one
 *     condition of a gate that is Journeyman+ AND Neutral+ AND not
 *     suspended AND not in recovery (§4.14). A refused post already says
 *     which one held (useComposerSubmit's RANKED_FEED_DENY_COPY), so the
 *     note names none.
 *   - A refused join, bcc_permission_denied: "You don't meet this group's
 *     requirements yet." That code is also admin approval, invite-only and
 *     a moderator's removal (§4.7.1 / §4.7.3), where "yet" is untrue.
 *   - Composer PUBLIC GROUP: "Anyone can see it on the group page." A
 *     secret group's page is members-only (§4.7.6).
 *   - /communities intro: "LOCAL rooms cluster by chain" (locals were
 *     retracted) and "the rest are open rooms anyone can join" (closed
 *     groups are listed too, joined by request).
 *
 * The feed copy is rendered; the composer option list and the server page
 * intro are read from source (an unexported constant and an async server
 * component).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("feed=ranked"),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/halls/welders",
}));
vi.mock("@/hooks/useGroupFeed", () => ({
  GROUP_FEED_QUERY_KEY_ROOT: ["groups", "feed"],
  useGroupFeed: () => ({
    isPending: false,
    isLoading: false,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    isFetchNextPageError: false,
    error: null,
    data: { pages: [{ items: [], pagination: { next_cursor: null, has_more: false } }] },
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}));
vi.mock("@/components/composer/Composer", () => ({ Composer: () => null }));
vi.mock("@/components/groups/GroupPostPolicyToggle", () => ({ GroupPostPolicyToggle: () => null }));

import { GroupFeedSection } from "@/components/groups/GroupFeedSection";
import { humanizeMembershipError } from "@/components/groups/GroupMembershipStrip";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

afterEach(cleanup);

describe("Hall ranked feed — no single rank named as the rule", () => {
  const hall = {
    id: 7,
    name: "Welders",
    type: "hall",
    feed_visible: true,
    viewer_membership: { is_member: true },
    can_use_public_all: false,
    permissions: {},
  } as never;

  it("the composer note and the empty state speak of rank and standing, not Journeyman", () => {
    render(
      <QueryClientProvider client={new QueryClient()}>
        <GroupFeedSection group={hall} />
      </QueryClientProvider>,
    );

    expect(screen.getByText(/who can post here depends on rank and standing/)).toBeInTheDocument();
    expect(screen.getByText("Nothing on the ranked feed yet.")).toBeInTheDocument();
    expect(screen.getByText(/whose rank and standing allow it/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Journeyman/);
  });

  it("the reasons a refused ranked post shows still exist, one per gate", () => {
    const submit = read("src/components/composer/useComposerSubmit.ts");
    for (const reason of ["suspended", "new_member", "below_journeyman", "below_neutral", "in_recovery"]) {
      expect(submit, reason).toMatch(new RegExp(`\\b${reason}:`));
    }
  });
});

describe("a refused join, bcc_permission_denied", () => {
  const denied = new BccApiError("bcc_permission_denied", "server wording that must never be shown", 403, null);

  it("says the viewer can't join right now, not that they don't meet requirements yet", () => {
    expect(humanizeMembershipError(denied, "join", "group")).toBe("You can't join this group right now.");
    expect(humanizeMembershipError(denied, "join", "Hall")).toBe("You can't join this Hall right now.");
    expect(humanizeMembershipError(denied, "join", "group")).not.toMatch(/requirements|yet/);
  });
});

describe("Composer — the PUBLIC GROUP option", () => {
  it("says who can see the post in a way that is true in a secret group too", () => {
    const src = read("src/components/composer/Composer.tsx");
    expect(src).toMatch(/label: "PUBLIC GROUP",[\s\S]{0,400}?description: "Anyone who can open the group page can see it\."/);
    expect(src).not.toMatch(/Anyone can see it on the group page/);
  });
});

describe("/communities intro", () => {
  it("names no LOCAL rooms and doesn't call every other room open", () => {
    // Site Structure A: the intro is the section header's one-sentence
    // lede (COMMUNITIES_SECTION), naming the kinds of room.
    const src = read("src/app/(main)/(app)/communities/page.tsx");
    const start = src.indexOf("const COMMUNITIES_SECTION");
    expect(start).toBeGreaterThan(-1);
    const intro = src.slice(start, src.indexOf("} as const;", start));
    expect(intro).not.toMatch(/LOCAL/);
    expect(intro).not.toMatch(/anyone can join/);
    expect(intro).toMatch(/lede: "Places you join: chain Halls, holder and delegator groups, and member-made rooms\."/);
  });
});
