/**
 * F-272 (b) — "Requests & invitations", the owner / manager / site-admin
 * side of closed and secret plain groups.
 *
 * Real React Query lists and mutations run against stubbed endpoints, so
 * these pin the requests themselves (sent / not sent, which group, which
 * member). The directory search hook is stubbed: the picker's contract is
 * "search only at 2+ characters, never offer yourself".
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type GroupDetailResponse } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const api = vi.hoisted(() => ({
  getGroupJoinRequests: vi.fn(),
  approveJoinRequest: vi.fn(),
  denyJoinRequest: vi.fn(),
  getGroupInvites: vi.fn(),
  inviteToGroup: vi.fn(),
  revokeGroupInvite: vi.fn(),
  useMembers: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api/my-groups-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getGroupJoinRequests: (id: number, params: unknown) => api.getGroupJoinRequests(id, params),
  approveJoinRequest: (id: number, userId: number) => api.approveJoinRequest(id, userId),
  denyJoinRequest: (id: number, userId: number) => api.denyJoinRequest(id, userId),
  getGroupInvites: (id: number, params: unknown) => api.getGroupInvites(id, params),
  inviteToGroup: (id: number, userId: number) => api.inviteToGroup(id, userId),
  revokeGroupInvite: (id: number, userId: number) => api.revokeGroupInvite(id, userId),
}));

vi.mock("@/hooks/useMembers", () => ({
  useMembers: (opts: unknown) => api.useMembers(opts),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { handle: "owner" } } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: api.refresh, push: vi.fn(), replace: vi.fn() }),
}));

const { GroupMembershipAdmin } = await import("@/components/groups/GroupMembershipAdmin");

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

const IDLE_SEARCH = { isPending: true, isError: false, data: undefined, refetch: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  api.useMembers.mockReturnValue(IDLE_SEARCH);
  api.getGroupInvites.mockResolvedValue(page([]));
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

function group(over: Partial<GroupDetailResponse> = {}): GroupDetailResponse {
  return {
    id: 52,
    name: "Night Shift",
    type: "user",
    privacy: "closed",
    pending_request_count: 1,
    ...over,
  } as unknown as GroupDetailResponse;
}

function person(id: number, handle: string, display_name: string, extra: Record<string, string>) {
  return { id, handle, display_name, avatar_url: "", joined_at: "2026-11-01T00:00:00Z", reputation_tier_label: "Neutral", ...extra };
}

function page<T>(items: T[], hasMore = false, offset = 0) {
  return { items, pagination: { offset, limit: 24, total: items.length + (hasMore ? 24 : 0), has_more: hasMore } };
}

const REQUEST = person(140, "riggerjo", "Jo Rigger", { requested_at: "2026-11-17T08:00:00Z" });
const INVITE = person(150, "welderkim", "Kim Welder", { invited_at: "2026-11-16T08:00:00Z" });
const decided = (status: string, userId: number) => ({ status, group_id: 52, user_id: userId });

const denyDialog = () => screen.getByRole("dialog", { name: "Deny this request?" });

// ─────────────────────────────────────────────────────────────────────
// Who sees it
// ─────────────────────────────────────────────────────────────────────

describe("the gate", () => {
  it("renders nothing for an ordinary viewer and calls no owner route", () => {
    const { container } = withClient(<GroupMembershipAdmin group={group({ pending_request_count: null })} />);
    expect(container).toBeEmptyDOMElement();
    expect(api.getGroupJoinRequests).not.toHaveBeenCalled();
    expect(api.getGroupInvites).not.toHaveBeenCalled();
  });

  it("the server's can_manage_membership:false wins over everything", () => {
    const { container } = withClient(
      <GroupMembershipAdmin group={group({ can_manage_membership: false, pending_request_count: null })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("a secret group's decider gets invitations only — secret groups take no requests", async () => {
    withClient(
      <GroupMembershipAdmin group={group({ privacy: "secret", can_manage_membership: true, pending_request_count: null })} />,
    );
    expect(screen.getByRole("heading", { name: "Requests & invitations" })).toBeInTheDocument();
    expect(screen.queryByText("ASKING TO JOIN")).toBeNull();
    expect(await screen.findByText("No outstanding invitations.")).toBeInTheDocument();
    expect(api.getGroupJoinRequests).not.toHaveBeenCalled();
    expect(api.getGroupInvites).toHaveBeenCalledWith(52, { offset: 0, limit: 24 });
  });

  it("on a backend without can_manage_membership, a closed group's request count is the gate", async () => {
    api.getGroupJoinRequests.mockResolvedValue(page([REQUEST]));
    withClient(<GroupMembershipAdmin group={group()} />);
    expect(await screen.findByRole("link", { name: "Jo Rigger" })).toHaveAttribute("href", "/u/riggerjo");
    expect(api.getGroupJoinRequests).toHaveBeenCalledWith(52, { offset: 0, limit: 24 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Pending requests
// ─────────────────────────────────────────────────────────────────────

describe("pending requests", () => {
  it("APPROVE admits that member, refreshes the page and re-reads the list", async () => {
    api.getGroupJoinRequests.mockResolvedValueOnce(page([REQUEST])).mockResolvedValue(page([]));
    api.approveJoinRequest.mockResolvedValue(decided("member", 140));
    withClient(<GroupMembershipAdmin group={group()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Approve Jo Rigger" }));
    await waitFor(() => expect(api.approveJoinRequest).toHaveBeenCalledWith(52, 140));
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("No one is waiting to join.")).toBeInTheDocument();
    expect(screen.getByText("Jo Rigger is now a member.")).toHaveAttribute("role", "status");
    expect(api.denyJoinRequest).not.toHaveBeenCalled();
  });

  it("DENY asks first (silent, 7-day wait) and sends nothing until confirmed", async () => {
    api.getGroupJoinRequests.mockResolvedValueOnce(page([REQUEST])).mockResolvedValue(page([]));
    api.denyJoinRequest.mockResolvedValue(decided("none", 140));
    withClient(<GroupMembershipAdmin group={group()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Deny Jo Rigger" }));
    expect(
      within(denyDialog()).getByText("Jo Rigger won't be told, and can't ask to join again for 7 days."),
    ).toBeInTheDocument();
    expect(api.denyJoinRequest).not.toHaveBeenCalled();

    fireEvent.click(within(denyDialog()).getByRole("button", { name: "DENY" }));
    await waitFor(() => expect(api.denyJoinRequest).toHaveBeenCalledWith(52, 140));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.approveJoinRequest).not.toHaveBeenCalled();
  });

  it("KEEP REQUEST closes without denying", async () => {
    api.getGroupJoinRequests.mockResolvedValue(page([REQUEST]));
    withClient(<GroupMembershipAdmin group={group()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Deny Jo Rigger" }));
    fireEvent.click(within(denyDialog()).getByRole("button", { name: "KEEP REQUEST" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.denyJoinRequest).not.toHaveBeenCalled();
  });

  it("a 409 says the list moved, and the list is re-read", async () => {
    api.getGroupJoinRequests.mockResolvedValue(page([REQUEST]));
    api.approveJoinRequest.mockRejectedValue(new BccApiError("bcc_conflict", "raw server prose", 409, null));
    withClient(<GroupMembershipAdmin group={group()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Approve Jo Rigger" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This changed a moment ago. Showing the latest.");
    expect(screen.queryByText(/raw server prose/)).toBeNull();
    await waitFor(() => expect(api.getGroupJoinRequests).toHaveBeenCalledTimes(2));
  });

  it("a failed first read says so with Retry, never 'no one is waiting'", async () => {
    api.getGroupJoinRequests
      .mockRejectedValueOnce(new BccApiError("bcc_unavailable", "x", 503, null))
      .mockResolvedValue(page([REQUEST]));
    withClient(<GroupMembershipAdmin group={group()} />);

    expect(await screen.findByText("Couldn't load join requests.")).toBeInTheDocument();
    expect(screen.queryByText("No one is waiting to join.")).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /retry/i })[0] as HTMLElement);
    expect(await screen.findByRole("link", { name: "Jo Rigger" })).toBeInTheDocument();
  });

  it("SHOW MORE reads the next page at offset + limit", async () => {
    api.getGroupJoinRequests
      .mockResolvedValueOnce(page([REQUEST], true, 0))
      .mockResolvedValueOnce(page([person(141, "fitterlee", "Lee Fitter", { requested_at: "2026-11-15T08:00:00Z" })], false, 24));
    withClient(<GroupMembershipAdmin group={group()} />);

    await screen.findByRole("link", { name: "Jo Rigger" });
    fireEvent.click(screen.getByRole("button", { name: "SHOW MORE" }));
    expect(await screen.findByRole("link", { name: "Lee Fitter" })).toBeInTheDocument();
    expect(api.getGroupJoinRequests).toHaveBeenLastCalledWith(52, { offset: 24, limit: 24 });
  });
});

// ─────────────────────────────────────────────────────────────────────
// Invitations
// ─────────────────────────────────────────────────────────────────────

function searchResults(cards: Array<{ id: number; handle: string; name: string }>) {
  return {
    isPending: false,
    isError: false,
    data: { items: cards.map((c) => ({ ...c, crest: { image_url: null, image_fallback_url: null } })) },
    refetch: vi.fn(),
  };
}

const secretGroup = () => group({ privacy: "secret", can_manage_membership: true, pending_request_count: null });

describe("inviting", () => {
  it("searches only from two characters", async () => {
    withClient(<GroupMembershipAdmin group={secretGroup()} />);
    const field = screen.getByRole("searchbox", { name: "Find a member by name or handle" });

    fireEvent.change(field, { target: { value: "k" } });
    await new Promise((r) => setTimeout(r, 350));
    expect(api.useMembers).toHaveBeenLastCalledWith(expect.objectContaining({ enabled: false }));

    fireEvent.change(field, { target: { value: "ki" } });
    await waitFor(() =>
      expect(api.useMembers).toHaveBeenLastCalledWith(expect.objectContaining({ q: "ki", enabled: true })),
    );
  });

  it("says hidden members can't be found, so an empty result is no surprise", () => {
    withClient(<GroupMembershipAdmin group={secretGroup()} />);
    expect(
      screen.getByText("Members who hide themselves from member search can't be found here."),
    ).toBeInTheDocument();
  });

  it("never offers yourself; INVITE invites that member and the list is re-read", async () => {
    api.useMembers.mockReturnValue(
      searchResults([
        { id: 1, handle: "owner", name: "Me" },
        { id: 150, handle: "welderkim", name: "Kim Welder" },
      ]),
    );
    api.getGroupInvites.mockResolvedValueOnce(page([])).mockResolvedValue(page([INVITE]));
    api.inviteToGroup.mockResolvedValue(decided("invited", 150));
    withClient(<GroupMembershipAdmin group={secretGroup()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ki" } });

    const invite = await screen.findByRole("button", { name: "Invite Kim Welder" });
    expect(screen.queryByRole("button", { name: "Invite Me" })).toBeNull();
    fireEvent.click(invite);

    await waitFor(() => expect(api.inviteToGroup).toHaveBeenCalledWith(52, 150));
    expect(await screen.findByRole("button", { name: "Invited Kim Welder" })).toBeDisabled();
    expect(screen.getByText("Invitation sent to Kim Welder.")).toHaveAttribute("role", "status");
    expect(await screen.findByRole("button", { name: "Revoke the invitation to Kim Welder" })).toBeInTheDocument();
  });

  it.each([
    ["the generic refusal (a ban and a block read the same)", new BccApiError("bcc_permission_denied", "raw", 403, null), "This member can't be invited."],
    ["an unknown or suspended account (identical 404)", new BccApiError("bcc_invalid_request", "raw", 404, null), "We couldn't find that member."],
    ["the open-invitation / daily cap", new BccApiError("bcc_rate_limited", "raw", 429, null), "Invitation limit reached for now. Try again later, or withdraw some outstanding invitations."],
    ["already in, already invited, or asked to join (409)", new BccApiError("bcc_conflict", "raw", 409, null), "They're already a member, already invited, or have asked to join — check the lists on this page."],
  ])("maps %s by code", async (_label, err, copy) => {
    api.useMembers.mockReturnValue(searchResults([{ id: 150, handle: "welderkim", name: "Kim Welder" }]));
    api.inviteToGroup.mockRejectedValue(err);
    withClient(<GroupMembershipAdmin group={secretGroup()} />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ki" } });

    fireEvent.click(await screen.findByRole("button", { name: "Invite Kim Welder" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(copy);
    expect(screen.queryByText("raw")).toBeNull();
  });

  it("REVOKE withdraws that invitation in one tap", async () => {
    api.getGroupInvites.mockResolvedValueOnce(page([INVITE])).mockResolvedValue(page([]));
    api.revokeGroupInvite.mockResolvedValue(decided("none", 150));
    withClient(<GroupMembershipAdmin group={secretGroup()} />);

    fireEvent.click(await screen.findByRole("button", { name: "Revoke the invitation to Kim Welder" }));
    await waitFor(() => expect(api.revokeGroupInvite).toHaveBeenCalledWith(52, 150));
    expect(await screen.findByText("No outstanding invitations.")).toBeInTheDocument();
  });
});
