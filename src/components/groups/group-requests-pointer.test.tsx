/**
 * F-388 — "N requests waiting" on the group page strip.
 *
 * Join requests are decided on the Members tab ("Requests & invitations"),
 * so from the Stream an owner or manager could not see that anyone was
 * waiting. The strip now points there, by anchor, while the server's
 * `pending_request_count` is above zero, and only for a viewer who decides
 * (`canManageMembership`, the same gate as the block it links to).
 *
 * The strip renders with real React Query and its real Leave / owner-hint
 * branches; only the ownership-transfer dialog is stubbed (it has its own
 * tests and reads the roster).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { GroupDetailResponse } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: null }),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));
vi.mock("@/hooks/useHallsPrimary", () => ({
  useJoinHallMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useLeaveHallMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}));
vi.mock("@/components/groups/GroupTransferOwnership", () => ({
  GroupTransferOwnership: () => null,
}));

const { GroupMembershipStrip } = await import("@/components/groups/GroupMembershipStrip");
const { MEMBERSHIP_REQUESTS_ANCHOR } = await import("@/components/groups/GroupMembershipAdmin");

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

let client: QueryClient;

beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
});

function withClient(ui: ReactNode) {
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

const MEMBERS_HREF = "/communities/night-shift/members";
const NOT = { allowed: false, unlock_hint: null, reason_code: "already_member" };

/** A manager: a member who may leave, and decides who gets in. */
function managed(over: Partial<GroupDetailResponse> = {}): GroupDetailResponse {
  return {
    id: 52,
    slug: "night-shift",
    name: "Night Shift",
    type: "user",
    privacy: "closed",
    viewer_membership: { is_member: true, joined_at: "2026-11-01T00:00:00Z", status: "member" },
    permissions: {
      can_leave: { allowed: true, unlock_hint: null, reason_code: null },
      can_join: NOT,
      can_read_feed: { allowed: true, unlock_hint: null, reason_code: null },
    },
    can_manage_membership: true,
    pending_request_count: 3,
    ...over,
  } as unknown as GroupDetailResponse;
}

/** The owner: cannot leave without a handoff (the server says why). */
function owned(over: Partial<GroupDetailResponse> = {}): GroupDetailResponse {
  return managed({
    permissions: {
      can_leave: {
        allowed: false,
        unlock_hint: "Owners hand the community over before leaving.",
        reason_code: "owner_cannot_leave",
      },
      can_join: NOT,
      can_read_feed: { allowed: true, unlock_hint: null, reason_code: null },
    },
    ...over,
  } as Partial<GroupDetailResponse>);
}

const pointer = () => screen.queryByRole("link", { name: /requests? waiting/i });

describe("GroupMembershipStrip — pending join requests pointer", () => {
  it("a manager sees how many are waiting, linked to the Members tab's requests block", () => {
    withClient(<GroupMembershipStrip group={managed()} membersHref={MEMBERS_HREF} />);
    const link = pointer();
    expect(link).not.toBeNull();
    expect(link).toHaveAccessibleName("3 requests waiting");
    expect(link).toHaveAttribute("href", `${MEMBERS_HREF}#${MEMBERSHIP_REQUESTS_ANCHOR}`);
    expect(MEMBERSHIP_REQUESTS_ANCHOR).toBe("requests");
    // Alongside the manager's own action, not instead of it.
    expect(screen.getByRole("button", { name: /leave/i })).toBeInTheDocument();
  });

  it("one request reads in the singular", () => {
    withClient(<GroupMembershipStrip group={managed({ pending_request_count: 1 })} membersHref={MEMBERS_HREF} />);
    expect(pointer()).toHaveAccessibleName("1 request waiting");
  });

  it("the owner sees it too, under the leave hint", () => {
    withClient(<GroupMembershipStrip group={owned()} membersHref={MEMBERS_HREF} />);
    expect(screen.getByText("Owners hand the community over before leaving.")).toBeInTheDocument();
    expect(pointer()).toHaveAccessibleName("3 requests waiting");
  });

  it("is a full 44px target", () => {
    withClient(<GroupMembershipStrip group={managed()} membersHref={MEMBERS_HREF} />);
    expect(pointer()!.className).toContain("min-h-[44px]");
  });

  it("on a backend without can_manage_membership, a non-null count is the gate", () => {
    const group = managed();
    delete (group as { can_manage_membership?: boolean }).can_manage_membership;
    withClient(<GroupMembershipStrip group={group} membersHref={MEMBERS_HREF} />);
    expect(pointer()).toHaveAccessibleName("3 requests waiting");
  });

  // ── when it stays away ───────────────────────────────────────────────

  it("nobody waiting: no pointer", () => {
    withClient(<GroupMembershipStrip group={managed({ pending_request_count: 0 })} membersHref={MEMBERS_HREF} />);
    expect(pointer()).toBeNull();
  });

  it("an ordinary member (count null, not a decider): no pointer", () => {
    withClient(
      <GroupMembershipStrip
        group={managed({ can_manage_membership: false, pending_request_count: null })}
        membersHref={MEMBERS_HREF}
      />,
    );
    expect(pointer()).toBeNull();
  });

  it("the server says not a decider: no pointer, even with a count", () => {
    withClient(
      <GroupMembershipStrip group={managed({ can_manage_membership: false })} membersHref={MEMBERS_HREF} />,
    );
    expect(pointer()).toBeNull();
  });

  it("a secret group (no request queue, count null): no pointer", () => {
    withClient(
      <GroupMembershipStrip
        group={managed({ privacy: "secret", pending_request_count: null })}
        membersHref={MEMBERS_HREF}
      />,
    );
    expect(pointer()).toBeNull();
  });

  it("a route with no Members URL: no pointer", () => {
    withClient(<GroupMembershipStrip group={managed()} />);
    expect(pointer()).toBeNull();
  });
});
