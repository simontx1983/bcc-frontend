/**
 * F-244 item 1 — leaving a delegator community records the same 90-day
 * opt-out as leaving a holder group, but it fired on one tap. LEAVE now
 * confirms first on both surfaces that offer it (the group-page strip and
 * the profile Groups tab), through the same control as the holder leave.
 *
 * Real React Query mutations against a stubbed endpoint, so these pin the
 * request itself (sent / not sent), not a mocked `mutate`.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type GroupDetailResponse, type UserGroupItem } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const api = vi.hoisted(() => ({
  leaveValidatorGroup: vi.fn(),
  getUserGroups: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api/validator-groups-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  leaveValidatorGroup: (id: number) => api.leaveValidatorGroup(id),
  joinValidatorGroup: vi.fn(),
}));

vi.mock("@/hooks/useHallsPrimary", () => ({
  useJoinHallMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useLeaveHallMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}));

vi.mock("@/hooks/useUserActivity", () => ({
  USER_GROUPS_QUERY_KEY_ROOT: ["users", "groups"],
  useUserGroups: () => api.getUserGroups(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: api.refresh, push: vi.fn(), replace: vi.fn() }),
}));

const { VALIDATOR_LEAVE_CONFIRM_COPY } = await import("@/components/groups/HolderLeaveConfirm");
const { GroupMembershipStrip } = await import("@/components/groups/GroupMembershipStrip");
const { GroupsPanel } = await import("@/components/profile/panels/GroupsPanel");

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
  vi.clearAllMocks();
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

const dialog = () => screen.getByRole("dialog", { name: VALIDATOR_LEAVE_CONFIRM_COPY.title });
const confirmButton = () => within(dialog()).getByRole("button", { name: "LEAVE" });

const ALLOW = { allowed: true, unlock_hint: null, reason_code: null };
const DENY = { allowed: false, unlock_hint: null, reason_code: "already_member" };

function delegatorGroup(): GroupDetailResponse {
  return {
    id: 61,
    name: "Delegators: Acme",
    type: "validator",
    validator_stats: null,
    viewer_membership: { is_member: true, joined_at: "2026-10-01T00:00:00Z", status: "member" },
    permissions: { can_leave: ALLOW, can_join: DENY, can_read_feed: ALLOW },
  } as unknown as GroupDetailResponse;
}

describe("GroupMembershipStrip — delegator community", () => {
  it("LEAVE opens the confirmation and sends nothing", () => {
    withClient(<GroupMembershipStrip group={delegatorGroup()} />);
    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));

    expect(
      within(dialog()).getByText(
        "You'll stop seeing its posts. Leaving starts a 90-day cooldown before this community is suggested to you again, but you can rejoin any time while you delegate to this validator.",
      ),
    ).toBeInTheDocument();
    expect(api.leaveValidatorGroup).not.toHaveBeenCalled();
  });

  it("confirming leaves this group, then refreshes the page", async () => {
    api.leaveValidatorGroup.mockResolvedValue({ ok: true });
    withClient(<GroupMembershipStrip group={delegatorGroup()} />);

    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
    fireEvent.click(confirmButton());
    await waitFor(() => expect(api.leaveValidatorGroup).toHaveBeenCalledWith(61));
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("STAY closes without leaving", () => {
    withClient(<GroupMembershipStrip group={delegatorGroup()} />);
    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "STAY" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.leaveValidatorGroup).not.toHaveBeenCalled();
  });
});

describe("GroupsPanel — delegator row", () => {
  const row = {
    group_id: 62,
    slug: "delegators-acme",
    name: "Delegators: Acme",
    type: "validator",
    type_label: "Delegators",
    member_count: 4,
    privacy: "closed",
    verification: null,
    permissions: { can_leave: ALLOW, can_join: DENY },
  } as unknown as UserGroupItem;

  function mountPanel() {
    api.getUserGroups.mockReturnValue({
      isPending: false,
      isError: false,
      isLoadingError: false,
      isRefetchError: false,
      error: null,
      data: { items: [row] },
      refetch: vi.fn(),
    });
    withClient(<GroupsPanel handle="fixture" />);
  }

  it("confirms before leaving", async () => {
    api.leaveValidatorGroup.mockResolvedValue({ ok: true });
    mountPanel();

    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
    expect(api.leaveValidatorGroup).not.toHaveBeenCalled();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(api.leaveValidatorGroup).toHaveBeenCalledWith(62));
  });

  it("the owner's refusal keeps its own copy, inside the dialog", async () => {
    api.leaveValidatorGroup.mockRejectedValue(
      new BccApiError("bcc_permission_denied", "raw server prose", 403, null),
    );
    mountPanel();

    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
    fireEvent.click(confirmButton());
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(
      "You created this group, so you can't leave it.",
    );
    expect(screen.queryByText(/raw server prose/)).toBeNull();
  });
});
