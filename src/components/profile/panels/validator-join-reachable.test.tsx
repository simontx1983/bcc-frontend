/**
 * A delegator community must not be a dead end on the profile Groups tab.
 *
 * `UserGroupsEndpoint::canJoin()` hard-returns `allowed: false` with
 * `reason_code: 'not_eligible'` for every validator group, because only a
 * live LCD delegation check can settle eligibility and the list view-model
 * runs none. So gating the control on `can_join` alone left the row with a
 * hint and no affordance, while `GroupMembershipStrip` offered the verified
 * join for the identical state.
 *
 * Two-sided on purpose: the two "stays hint-only" cases are what stop the
 * branch widening to every denial or every group kind.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GroupPermissionEntry, UserGroupItem } from "@/lib/api/types";

const joinValidator = vi.fn();
const state = vi.hoisted(() => ({ items: [] as unknown[] }));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock("@/hooks/useUserActivity", () => ({
  USER_GROUPS_QUERY_KEY_ROOT: ["user-groups"],
  useUserGroups: () => ({
    isPending: false,
    isError: false,
    error: null,
    data: { items: state.items },
    refetch: vi.fn(),
  }),
}));

const idleMutation = () => ({
  mutate: vi.fn(),
  reset: vi.fn(),
  isPending: false,
  error: null,
});

vi.mock("@/hooks/useValidatorGroups", () => ({
  humanizeValidatorJoinError: () => "nope",
  useJoinValidatorGroupMutation: () => ({
    mutate: joinValidator,
    reset: vi.fn(),
    isPending: false,
    error: null,
  }),
  useLeaveValidatorGroupMutation: idleMutation,
}));
vi.mock("@/hooks/useHolderGroups", () => ({
  useJoinHolderGroupMutation: idleMutation,
  useLeaveHolderGroupMutation: idleMutation,
}));
vi.mock("@/hooks/useHallsPrimary", () => ({
  useJoinHallMutation: idleMutation,
  useLeaveHallMutation: idleMutation,
}));
vi.mock("@/hooks/useMyGroups", () => ({
  useJoinPlainGroupMutation: idleMutation,
  useLeavePlainGroupMutation: idleMutation,
}));

const { GroupsPanel } = await import("@/components/profile/panels/GroupsPanel");

const DENY: GroupPermissionEntry = { allowed: false, unlock_hint: null, reason_code: null };

function row(
  type: UserGroupItem["type"],
  canJoin: Partial<GroupPermissionEntry>,
): UserGroupItem {
  return {
    group_id: 4242,
    slug: "acme-delegators",
    name: "Acme Delegators",
    type,
    type_label: "Delegators",
    member_count: 7,
    privacy: "open",
    verification: null,
    actions: {} as UserGroupItem["actions"],
    permissions: {
      can_join: { ...DENY, ...canJoin },
      can_leave: DENY,
    },
  };
}

const NOT_ELIGIBLE = {
  reason_code: "not_eligible",
  unlock_hint: "Delegate at least 5 ATOM to Acme to join this community.",
};

function mount(items: UserGroupItem[]) {
  state.items = items;
  render(<GroupsPanel handle="someone" />);
}

afterEach(() => {
  cleanup();
  joinValidator.mockClear();
  state.items = [];
});

describe("delegator community on the profile Groups tab", () => {
  it("offers a working join control when the gate is not_eligible", () => {
    mount([row("validator", NOT_ELIGIBLE)]);

    const button = screen.getByRole("button", { name: /JOIN/i });
    fireEvent.click(button);

    expect(joinValidator).toHaveBeenCalledTimes(1);
    expect(joinValidator).toHaveBeenCalledWith(4242);
  });

  it("keeps the server's hint as the primary copy next to the control", () => {
    mount([row("validator", NOT_ELIGIBLE)]);

    // The figure comes from the server and must not be substituted.
    expect(screen.getByText(NOT_ELIGIBLE.unlock_hint)).toBeTruthy();
    expect(screen.getByRole("button", { name: /JOIN/i })).toBeTruthy();
  });

  it("does NOT reach for the control on a non-validator kind", () => {
    mount([row("nft", NOT_ELIGIBLE)]);

    expect(screen.queryByRole("button", { name: /JOIN/i })).toBeNull();
    expect(screen.getByText(NOT_ELIGIBLE.unlock_hint)).toBeTruthy();
  });

  it("does NOT reach for the control on a different denial reason", () => {
    mount([
      row("validator", { reason_code: "auth_required", unlock_hint: "Sign in to join." }),
    ]);

    expect(screen.queryByRole("button", { name: /JOIN/i })).toBeNull();
    expect(screen.getByText("Sign in to join.")).toBeTruthy();
  });
});
