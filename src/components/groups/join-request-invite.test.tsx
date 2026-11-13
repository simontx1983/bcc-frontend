/**
 * F-272 (viewer side) — asking to join a closed group, cancelling the ask,
 * and answering an invitation, on the group page strip and in the
 * /communities "Your invitations" list.
 *
 * Real React Query mutations run against stubbed endpoints, so these pin
 * the request itself (sent / not sent, to which id), not a mocked `mutate`.
 * Every branch is driven by the server's `viewer_membership.status` and
 * `permissions.can_request_join`; the controls prove nothing is recomputed
 * client-side (no status → no ask, unless the server allows it).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type GroupDetailResponse, type MyGroupInvite } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const api = vi.hoisted(() => ({
  requestJoinGroup: vi.fn(),
  cancelJoinRequest: vi.fn(),
  acceptGroupInvite: vi.fn(),
  declineGroupInvite: vi.fn(),
  getMyGroupInvites: vi.fn(),
  refresh: vi.fn(),
  sessionStatus: "authenticated" as "authenticated" | "unauthenticated" | "loading",
}));

vi.mock("@/lib/api/my-groups-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  requestJoinGroup: (id: number) => api.requestJoinGroup(id),
  cancelJoinRequest: (id: number) => api.cancelJoinRequest(id),
  acceptGroupInvite: (id: number) => api.acceptGroupInvite(id),
  declineGroupInvite: (id: number) => api.declineGroupInvite(id),
  getMyGroupInvites: () => api.getMyGroupInvites(),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: api.sessionStatus, data: null }),
}));

vi.mock("@/hooks/useHallsPrimary", () => ({
  useJoinHallMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useLeaveHallMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: api.refresh, push: vi.fn(), replace: vi.fn() }),
}));

const { GroupMembershipStrip } = await import("@/components/groups/GroupMembershipStrip");
const { MyGroupInvitations } = await import("@/components/communities/MyGroupInvitations");

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
  api.sessionStatus = "authenticated";
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

const ALLOW = { allowed: true, unlock_hint: null, reason_code: null };
const DENY = { allowed: false, unlock_hint: null, reason_code: "private_group" };
const COOLDOWN = {
  allowed: false,
  unlock_hint: "You can ask again in 7 days.",
  reason_code: "cooldown",
};

function closedGroup(
  status: "none" | "requested" | "invited",
  canRequest: typeof ALLOW | typeof DENY | typeof COOLDOWN = DENY,
): GroupDetailResponse {
  return {
    id: 52,
    type: "user",
    viewer_membership: { is_member: false, joined_at: null, status },
    permissions: {
      can_leave: { allowed: false, unlock_hint: null, reason_code: "not_member" },
      can_join: DENY,
      can_read_feed: DENY,
      can_request_join: canRequest,
    },
  } as unknown as GroupDetailResponse;
}

const changed = (status: string) => ({ status, group_id: 52 });

// ─────────────────────────────────────────────────────────────────────
// The group page strip
// ─────────────────────────────────────────────────────────────────────

describe("GroupMembershipStrip — closed group", () => {
  it("REQUEST TO JOIN sends the ask for this group, then refreshes the page", async () => {
    api.requestJoinGroup.mockResolvedValue(changed("requested"));
    withClient(<GroupMembershipStrip group={closedGroup("none", ALLOW)} />);

    fireEvent.click(screen.getByRole("button", { name: "REQUEST TO JOIN" }));
    await waitFor(() => expect(api.requestJoinGroup).toHaveBeenCalledWith(52));
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
  });

  it("a refused ask shows code-keyed copy, never the server's prose", async () => {
    api.requestJoinGroup.mockRejectedValue(
      new BccApiError("bcc_permission_denied", "raw server prose", 403, null),
    );
    withClient(<GroupMembershipStrip group={closedGroup("none", ALLOW)} />);

    fireEvent.click(screen.getByRole("button", { name: "REQUEST TO JOIN" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "You can't ask to join this community right now.",
    );
    expect(screen.queryByText(/raw server prose/)).toBeNull();
    expect(api.refresh).not.toHaveBeenCalled();
  });

  it("control: no ask is offered when the server does not allow one", () => {
    withClient(<GroupMembershipStrip group={closedGroup("none", DENY)} />);
    expect(screen.queryByRole("button", { name: "REQUEST TO JOIN" })).toBeNull();
    expect(screen.queryByRole("button", { name: "CANCEL REQUEST" })).toBeNull();
  });

  it("the 7-day wait after a denied ask explains itself, with no button", () => {
    withClient(<GroupMembershipStrip group={closedGroup("none", COOLDOWN)} />);
    expect(screen.getByText("You can ask again in 7 days.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "REQUEST TO JOIN" })).toBeNull();
  });

  it("a pending ask offers CANCEL REQUEST, which withdraws it", async () => {
    api.cancelJoinRequest.mockResolvedValue(changed("none"));
    // can_request_join is irrelevant once an ask is pending.
    withClient(<GroupMembershipStrip group={closedGroup("requested", ALLOW)} />);

    expect(screen.getByText("Your request to join is waiting for a moderator.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "REQUEST TO JOIN" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "CANCEL REQUEST" }));
    await waitFor(() => expect(api.cancelJoinRequest).toHaveBeenCalledWith(52));
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
    expect(api.requestJoinGroup).not.toHaveBeenCalled();
  });

  it("an invitation offers ACCEPT and DECLINE; accept joins this group", async () => {
    api.acceptGroupInvite.mockResolvedValue({ ...changed("member"), joined: true });
    withClient(<GroupMembershipStrip group={closedGroup("invited")} />);

    fireEvent.click(screen.getByRole("button", { name: "ACCEPT INVITATION" }));
    await waitFor(() => expect(api.acceptGroupInvite).toHaveBeenCalledWith(52));
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
    expect(api.declineGroupInvite).not.toHaveBeenCalled();
  });

  it("declining sends the decline, not the accept", async () => {
    api.declineGroupInvite.mockResolvedValue(changed("none"));
    withClient(<GroupMembershipStrip group={closedGroup("invited")} />);

    fireEvent.click(screen.getByRole("button", { name: "DECLINE" }));
    await waitFor(() => expect(api.declineGroupInvite).toHaveBeenCalledWith(52));
    expect(api.acceptGroupInvite).not.toHaveBeenCalled();
  });

  it("a stale invitation says so", async () => {
    api.acceptGroupInvite.mockRejectedValue(new BccApiError("bcc_invalid_request", "x", 400, null));
    withClient(<GroupMembershipStrip group={closedGroup("invited")} />);

    fireEvent.click(screen.getByRole("button", { name: "ACCEPT INVITATION" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This invitation is no longer open.");
    expect(api.refresh).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// /communities — Your invitations
// ─────────────────────────────────────────────────────────────────────

function invite(id: number, name: string): MyGroupInvite {
  return {
    group: { id, slug: name.toLowerCase(), name, privacy: "secret", links: { self: `/groups/${id}` } },
    invited_by: { handle: "foreman", display_name: "Foreman" },
    invited_at: "2026-11-12T10:00:00Z",
  } as unknown as MyGroupInvite;
}

function invitesPage(items: MyGroupInvite[]) {
  return { items, pagination: { offset: 0, limit: 50, has_more: false } };
}

describe("MyGroupInvitations", () => {
  it("lists each invitation with who sent it", async () => {
    api.getMyGroupInvites.mockResolvedValue(invitesPage([invite(7, "Riggers"), invite(8, "Welders")]));
    withClient(<MyGroupInvitations />);

    expect(await screen.findByRole("heading", { name: "Your invitations" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Riggers" })).toHaveAttribute("href", "/groups/7");
    expect(screen.getAllByText(/Invited by @foreman/)).toHaveLength(2);
  });

  it("accepting joins that group and keeps the confirmation after the list refetches", async () => {
    api.getMyGroupInvites
      .mockResolvedValueOnce(invitesPage([invite(7, "Riggers"), invite(8, "Welders")]))
      // The refetch after accepting no longer carries the answered invite.
      .mockResolvedValue(invitesPage([invite(8, "Welders")]));
    api.acceptGroupInvite.mockResolvedValue({ status: "member", group_id: 7, joined: true });
    withClient(<MyGroupInvitations />);

    fireEvent.click(await screen.findByRole("button", { name: "Accept the invitation to Riggers" }));
    await waitFor(() => expect(api.acceptGroupInvite).toHaveBeenCalledWith(7));
    await waitFor(() => expect(api.getMyGroupInvites).toHaveBeenCalledTimes(2));

    const status = await screen.findByRole("status");
    expect(status).toHaveTextContent("You joined Riggers.");
    expect(within(status).getByRole("link", { name: "Riggers" })).toHaveAttribute("href", "/groups/7");
    expect(screen.queryByRole("button", { name: "Accept the invitation to Riggers" })).toBeNull();
    expect(screen.getByRole("button", { name: "Accept the invitation to Welders" })).toBeEnabled();
  });

  it("a failed answer stays on the row with code-keyed copy", async () => {
    api.getMyGroupInvites.mockResolvedValue(invitesPage([invite(7, "Riggers")]));
    api.declineGroupInvite.mockRejectedValue(new BccApiError("bcc_rate_limited", "raw", 429, null));
    withClient(<MyGroupInvitations />);

    fireEvent.click(await screen.findByRole("button", { name: "Decline the invitation to Riggers" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many attempts. Wait a minute and try again.",
    );
    expect(screen.queryByText("raw")).toBeNull();
  });

  it("a failed read says so with Retry, rather than looking empty", async () => {
    api.getMyGroupInvites
      .mockRejectedValueOnce(new BccApiError("bcc_unavailable", "x", 503, null))
      .mockResolvedValue(invitesPage([invite(7, "Riggers")]));
    withClient(<MyGroupInvitations />);

    expect(await screen.findByText("Couldn't load your invitations.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(await screen.findByRole("link", { name: "Riggers" })).toBeInTheDocument();
  });

  it("renders nothing when there are no invitations", async () => {
    api.getMyGroupInvites.mockResolvedValue(invitesPage([]));
    const { container } = withClient(<MyGroupInvitations />);
    await waitFor(() => expect(api.getMyGroupInvites).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("control: a signed-out visitor never reads /me/group-invites", () => {
    api.sessionStatus = "unauthenticated";
    const { container } = withClient(<MyGroupInvitations />);
    expect(api.getMyGroupInvites).not.toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });
});
