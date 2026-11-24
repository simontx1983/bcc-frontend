/**
 * An INVITE tap can land before the candidate row's mutation observer has
 * subscribed: useMutation subscribes in a passive effect, and on a loaded
 * runner the test's next step can run first. TanStack skips the callbacks
 * passed to mutate() when the observer has no listener at success, so a
 * success callback given to mutate() was dropped. The invitation went out
 * and the outstanding list re-read, but the row never showed INVITED. That
 * was the CI flake in group-membership-admin.test.tsx.
 *
 * This file defers React's scheduler host (setImmediate) so that ordering
 * happens on every run: the click comes before the row's effects. The
 * deferral is file-local; the timeouts below absorb it.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

import type { GroupDetailResponse } from "@/lib/api/types";

const host = vi.hoisted(() => {
  const g = globalThis as unknown as { setImmediate: unknown };
  const real = g.setImmediate;
  const realSetTimeout = globalThis.setTimeout;
  // React's scheduler binds setImmediate when it loads, so this runs first.
  g.setImmediate = (fn: (...a: unknown[]) => void, ...args: unknown[]) => realSetTimeout(() => fn(...args), 300);
  return { restore: () => void (g.setImmediate = real) };
});

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const api = vi.hoisted(() => ({
  getGroupInvites: vi.fn(),
  inviteToGroup: vi.fn(),
}));

vi.mock("@/lib/api/my-groups-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getGroupInvites: (id: number, params: unknown) => api.getGroupInvites(id, params),
  inviteToGroup: (id: number, userId: number) => api.inviteToGroup(id, userId),
}));

vi.mock("@/hooks/useMembers", () => ({
  useMembers: () => ({
    isPending: false,
    isError: false,
    data: { items: [{ id: 150, handle: "welderkim", name: "Kim Welder", crest: { image_url: null, image_fallback_url: null } }] },
    refetch: vi.fn(),
  }),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { handle: "owner" } } }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
}));

const { GroupMembershipAdmin } = await import("@/components/groups/GroupMembershipAdmin");

const SLOW = { timeout: 5000 };

afterEach(() => {
  cleanup();
});

afterAll(() => {
  host.restore();
});

function page<T>(items: T[]) {
  return { items, pagination: { offset: 0, limit: 24, total: items.length, has_more: false } };
}

const INVITE = {
  id: 150,
  handle: "welderkim",
  display_name: "Kim Welder",
  avatar_url: "",
  joined_at: "2026-11-01T00:00:00Z",
  reputation_tier_label: "Neutral",
  invited_at: "2026-11-16T08:00:00Z",
};

describe("inviting, when the tap beats the row's subscription", () => {
  it("still marks the member INVITED and announces it", async () => {
    api.getGroupInvites.mockResolvedValueOnce(page([])).mockResolvedValue(page([INVITE]));
    api.inviteToGroup.mockResolvedValue({ status: "invited", group_id: 52, user_id: 150 });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
    const group = {
      id: 52,
      name: "Night Shift",
      type: "user",
      privacy: "secret",
      can_manage_membership: true,
      pending_request_count: null,
    } as unknown as GroupDetailResponse;
    render(
      <QueryClientProvider client={client}>
        <GroupMembershipAdmin group={group} />
      </QueryClientProvider>,
    );
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "ki" } });

    fireEvent.click(await screen.findByRole("button", { name: "Invite Kim Welder" }, SLOW));

    await waitFor(() => expect(api.inviteToGroup).toHaveBeenCalledWith(52, 150), SLOW);
    expect(await screen.findByRole("button", { name: "Invited Kim Welder" }, SLOW)).toBeDisabled();
    expect(screen.getByText("Invitation sent to Kim Welder.")).toHaveAttribute("role", "status");
    expect(await screen.findByRole("button", { name: "Revoke the invitation to Kim Welder" }, SLOW)).toBeInTheDocument();
    client.clear();
  }, 15000);
});
