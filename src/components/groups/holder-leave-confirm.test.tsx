/**
 * Leaving an NFT holder group starts a 90-day cooldown, so LEAVE must
 * confirm before the request goes out — on every surface that offers it.
 *
 * Real React Query mutations run against stubbed endpoints, so these pin
 * the request itself (sent / not sent), not a mocked `mutate`.
 *
 * Hall and plain-group leaves have no cooldown and stay one-click; the
 * strip's Hall case is the control that proves the confirm is holder-only.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BccApiError,
  type GroupDetailResponse,
  type HolderGroupItem,
  type UserGroupItem,
} from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const api = vi.hoisted(() => ({
  leaveHolderGroup: vi.fn(),
  getMyHolderGroups: vi.fn(),
  leaveHall: vi.fn(),
  getUserGroups: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api/holder-groups-endpoints", () => ({
  leaveHolderGroup: (id: number) => api.leaveHolderGroup(id),
  getMyHolderGroups: () => api.getMyHolderGroups(),
  joinHolderGroup: vi.fn(),
  getHolderGroupPreferences: async () => ({ auto_join: false }),
  updateHolderGroupPreferences: vi.fn(),
}));

vi.mock("@/hooks/useHallsPrimary", () => ({
  useJoinHallMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useLeaveHallMutation: () => ({
    mutate: (id: number) => api.leaveHall(id),
    reset: vi.fn(),
    isPending: false,
    error: null,
  }),
}));

vi.mock("@/hooks/useUserActivity", () => ({
  USER_GROUPS_QUERY_KEY_ROOT: ["users", "groups"],
  useUserGroups: () => api.getUserGroups(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: api.refresh, push: vi.fn(), replace: vi.fn() }),
}));

const { HolderLeaveConfirm, HOLDER_LEAVE_CONFIRM_COPY } = await import(
  "@/components/groups/HolderLeaveConfirm"
);
const { GroupMembershipStrip } = await import("@/components/groups/GroupMembershipStrip");
const { CommunitiesList } = await import("@/components/settings/CommunitiesList");
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

const dialog = () => screen.getByRole("dialog", { name: HOLDER_LEAVE_CONFIRM_COPY.title });
const confirmButton = () => within(dialog()).getByRole("button", { name: "LEAVE" });

// ─────────────────────────────────────────────────────────────────────
// The shared control
// ─────────────────────────────────────────────────────────────────────

describe("HolderLeaveConfirm", () => {
  function renderControl(props: Partial<Parameters<typeof HolderLeaveConfirm>[0]> = {}) {
    const onSuccess = vi.fn();
    const onError = vi.fn();
    const onLeaveStart = vi.fn();
    withClient(
      <HolderLeaveConfirm
        groupId={7}
        humanizeError={(err) => (err.code === "bcc_rate_limited" ? "Too many." : "Couldn't leave.")}
        onSuccess={onSuccess}
        onError={onError}
        onLeaveStart={onLeaveStart}
        {...props}
      />,
    );
    return { onSuccess, onError, onLeaveStart };
  }

  it("LEAVE opens the confirmation and sends nothing", () => {
    const { onLeaveStart } = renderControl();
    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
    expect(dialog()).toBeInTheDocument();
    expect(api.leaveHolderGroup).not.toHaveBeenCalled();
    expect(onLeaveStart).not.toHaveBeenCalled();
  });

  it("states the cooldown and that an explicit rejoin stays open (F-158)", () => {
    renderControl();
    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
    expect(
      within(dialog()).getByText(
        "You'll stop seeing its posts. Leaving starts a 90-day cooldown before this community is suggested to you again, but you can rejoin any time while you hold the NFT.",
      ),
    ).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "STAY" })).toBeInTheDocument();
  });

  it("confirming sends the leave, then closes on success", async () => {
    api.leaveHolderGroup.mockResolvedValue({ ok: true });
    const { onSuccess, onLeaveStart } = renderControl();
    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
    fireEvent.click(confirmButton());

    expect(onLeaveStart).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(api.leaveHolderGroup).toHaveBeenCalledWith(7));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("STAY closes without sending", () => {
    renderControl();
    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
    fireEvent.click(within(dialog()).getByRole("button", { name: "STAY" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.leaveHolderGroup).not.toHaveBeenCalled();
  });

  it("a failure stays in the dialog with code-keyed copy", async () => {
    api.leaveHolderGroup.mockRejectedValue(
      new BccApiError("bcc_rate_limited", "raw server prose", 429, null),
    );
    const { onError, onSuccess } = renderControl();
    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
    fireEvent.click(confirmButton());

    const alert = await within(dialog()).findByRole("alert");
    expect(alert).toHaveTextContent("Too many.");
    expect(screen.queryByText(/raw server prose/)).toBeNull();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
    // The retry is offered in place.
    expect(within(dialog()).getByRole("button", { name: "TRY AGAIN" })).toBeEnabled();
  });

  it("cancelling after a failure clears it", async () => {
    api.leaveHolderGroup.mockRejectedValue(new BccApiError("bcc_internal_error", "x", 500, null));
    renderControl();
    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
    fireEvent.click(confirmButton());
    await within(dialog()).findByRole("alert");

    fireEvent.click(within(dialog()).getByRole("button", { name: "STAY" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// The three surfaces
// ─────────────────────────────────────────────────────────────────────

const ALLOW = { allowed: true, unlock_hint: null, reason_code: null };
const DENY = { allowed: false, unlock_hint: null, reason_code: "already_member" };

function detail(type: "nft" | "hall"): GroupDetailResponse {
  return {
    id: 31,
    type,
    viewer_membership: { is_member: true, joined_at: "2026-10-01T00:00:00Z" },
    permissions: { can_leave: ALLOW, can_join: DENY, can_read_feed: ALLOW },
  } as unknown as GroupDetailResponse;
}

describe("GroupMembershipStrip", () => {
  it("a holder group confirms before leaving", async () => {
    api.leaveHolderGroup.mockResolvedValue({ ok: true });
    withClient(<GroupMembershipStrip group={detail("nft")} />);

    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
    expect(api.leaveHolderGroup).not.toHaveBeenCalled();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(api.leaveHolderGroup).toHaveBeenCalledWith(31));
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
  });

  it("control: a Hall leave stays one-click", () => {
    withClient(<GroupMembershipStrip group={detail("hall")} />);
    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.leaveHall).toHaveBeenCalledWith(31);
  });
});

const HOLDER_ROW = {
  group_id: 44,
  slug: "hammers",
  name: "Hammer Holders",
  member_count: 12,
  collection: { chain: "ethereum", contract: "0xabc", name: "Hammers", image_url: null },
  verification: { label: "Verified" },
  activity: { heat: "warm", heat_label: "Warm", posts_last_7d: 3 },
} as unknown as HolderGroupItem;

describe("CommunitiesList", () => {
  it("a joined community confirms before leaving", async () => {
    api.getMyHolderGroups.mockResolvedValue({
      joined: [HOLDER_ROW],
      eligible_to_join: [],
      opted_out: [],
    });
    api.leaveHolderGroup.mockResolvedValue({ ok: true });
    withClient(<CommunitiesList />);

    fireEvent.click(await screen.findByRole("button", { name: "LEAVE" }));
    expect(api.leaveHolderGroup).not.toHaveBeenCalled();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(api.leaveHolderGroup).toHaveBeenCalledWith(44));
  });

  it("shows this surface's own failure copy inside the dialog", async () => {
    api.getMyHolderGroups.mockResolvedValue({
      joined: [HOLDER_ROW],
      eligible_to_join: [],
      opted_out: [],
    });
    api.leaveHolderGroup.mockRejectedValue(
      new BccApiError("bcc_rate_limited", "raw server prose", 429, null),
    );
    withClient(<CommunitiesList />);

    fireEvent.click(await screen.findByRole("button", { name: "LEAVE" }));
    fireEvent.click(confirmButton());
    expect(await within(dialog()).findByRole("alert")).toHaveTextContent(
      "Slow down — too many leave attempts. Wait a minute.",
    );
  });
});

describe("GroupsPanel", () => {
  it("a holder row confirms before leaving", async () => {
    const row = {
      group_id: 55,
      slug: "hammers",
      name: "Hammer Holders",
      type: "nft",
      type_label: "On-Chain Holders",
      member_count: 12,
      privacy: "open",
      verification: null,
      permissions: { can_leave: ALLOW, can_join: DENY },
    } as unknown as UserGroupItem;
    api.getUserGroups.mockReturnValue({
      isPending: false,
      isError: false,
      isLoadingError: false,
      isRefetchError: false,
      error: null,
      data: { items: [row] },
      refetch: vi.fn(),
    });
    api.leaveHolderGroup.mockResolvedValue({ ok: true });
    withClient(<GroupsPanel handle="fixture" />);

    fireEvent.click(screen.getByRole("button", { name: "LEAVE" }));
    expect(api.leaveHolderGroup).not.toHaveBeenCalled();

    fireEvent.click(confirmButton());
    await waitFor(() => expect(api.leaveHolderGroup).toHaveBeenCalledWith(55));
  });
});
