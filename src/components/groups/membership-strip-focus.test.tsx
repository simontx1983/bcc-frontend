/**
 * F-317 M-gr2 — focus after join / leave on the group page strip.
 *
 * Pressing JOIN used to disable the button, which drops keyboard focus to
 * <body>; then the refreshed page swapped JOIN for LEAVE (a different
 * component), and nothing said the join had happened: the pill flipped
 * silently. Now the button stays focusable while pending (aria-disabled,
 * guarded), focus moves to the control that replaced it once the refreshed
 * membership lands, and a polite region says "You joined this group." /
 * "You left this group.".
 *
 * Real React Query mutations run against stubbed endpoints; the page
 * refresh is simulated by re-rendering with the next server state, as
 * join-request-invite.test.tsx does.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GroupDetailResponse } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const api = vi.hoisted(() => ({
  joinPlainGroup: vi.fn(),
  leavePlainGroup: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/api/my-groups-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  joinPlainGroup: (id: number) => api.joinPlainGroup(id),
  leavePlainGroup: (id: number) => api.leavePlainGroup(id),
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: null }),
}));

vi.mock("@/hooks/useHallsPrimary", () => ({
  useJoinHallMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
  useLeaveHallMutation: () => ({ mutate: vi.fn(), reset: vi.fn(), isPending: false, error: null }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: api.refresh, push: vi.fn(), replace: vi.fn() }),
}));

const { GroupMembershipStrip } = await import("@/components/groups/GroupMembershipStrip");

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

function wrap(ui: ReactNode) {
  return <QueryClientProvider client={client}>{ui}</QueryClientProvider>;
}

const ALLOW = { allowed: true, unlock_hint: null, reason_code: null };
const NOT_MEMBER = { allowed: false, unlock_hint: null, reason_code: "not_member" };
const ALREADY = { allowed: false, unlock_hint: null, reason_code: "already_member" };
const PRIVATE = { allowed: false, unlock_hint: null, reason_code: "private_group" };
const LOCKED = { allowed: false, unlock_hint: "Membership is closed for now.", reason_code: "invite_only" };

function group(
  isMember: boolean,
  { type = "user", canJoin = ALLOW }: { type?: "user" | "hall"; canJoin?: typeof ALLOW | typeof LOCKED } = {},
): GroupDetailResponse {
  return {
    id: 61,
    name: "Night Shift",
    type,
    viewer_membership: {
      is_member: isMember,
      joined_at: isMember ? "2026-01-01T00:00:00Z" : null,
      status: isMember ? "member" : "none",
    },
    permissions: {
      can_leave: isMember ? ALLOW : NOT_MEMBER,
      can_join: isMember ? ALREADY : canJoin,
      can_read_feed: ALLOW,
      can_request_join: PRIVATE,
    },
  } as unknown as GroupDetailResponse;
}

const button = (name: string) => screen.getByRole("button", { name });
const live = () => screen.getByRole("status");

/** Focus the control and press it, as a keyboard user would. */
function press(el: HTMLElement) {
  el.focus();
  fireEvent.click(el);
}

describe("F-317 M-gr2 — the button keeps focus while the request is in flight", () => {
  it("JOIN is aria-disabled and busy, not disabled, and stays focused", async () => {
    api.joinPlainGroup.mockReturnValue(new Promise(() => {}));
    render(wrap(<GroupMembershipStrip group={group(false)} />));

    press(button("JOIN"));
    const pending = await screen.findByRole("button", { name: "JOINING…" });
    expect(pending).toHaveAttribute("aria-disabled", "true");
    expect(pending).toHaveAttribute("aria-busy", "true");
    expect(pending).not.toHaveAttribute("disabled");
    expect(document.activeElement).toBe(pending);
  });

  it("a second press while pending sends nothing", async () => {
    api.joinPlainGroup.mockReturnValue(new Promise(() => {}));
    render(wrap(<GroupMembershipStrip group={group(false)} />));

    press(button("JOIN"));
    fireEvent.click(await screen.findByRole("button", { name: "JOINING…" }));
    expect(api.joinPlainGroup).toHaveBeenCalledTimes(1);
  });
});

describe("F-317 M-gr2 — focus and announcement once the refreshed page lands", () => {
  it("after a join, focus moves to LEAVE and the join is announced", async () => {
    api.joinPlainGroup.mockResolvedValue({ joined: true });
    const { rerender } = render(wrap(<GroupMembershipStrip group={group(false)} />));
    expect(live()).toHaveTextContent("");

    press(button("JOIN"));
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
    rerender(wrap(<GroupMembershipStrip group={group(true)} />));

    expect(document.activeElement).toBe(button("LEAVE"));
    expect(live()).toHaveTextContent("You joined this group.");
  });

  it("after a leave, focus moves to JOIN and the leave is announced", async () => {
    api.leavePlainGroup.mockResolvedValue({ left: true });
    const { rerender } = render(wrap(<GroupMembershipStrip group={group(true)} />));

    press(button("LEAVE"));
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
    rerender(wrap(<GroupMembershipStrip group={group(false)} />));

    expect(document.activeElement).toBe(button("JOIN"));
    expect(live()).toHaveTextContent("You left this group.");
  });

  it("with no control left to land on, focus goes to the strip's heading", async () => {
    api.leavePlainGroup.mockResolvedValue({ left: true });
    const { rerender } = render(wrap(<GroupMembershipStrip group={group(true)} />));

    press(button("LEAVE"));
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
    rerender(wrap(<GroupMembershipStrip group={group(false, { canJoin: LOCKED })} />));

    expect(screen.queryByRole("button")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Your status here" }));
  });

  it("focus the viewer has moved somewhere else is left there", async () => {
    api.joinPlainGroup.mockResolvedValue({ joined: true });
    const { rerender } = render(
      wrap(
        <>
          <input aria-label="elsewhere" />
          <GroupMembershipStrip group={group(false)} />
        </>,
      ),
    );

    press(button("JOIN"));
    await waitFor(() => expect(api.refresh).toHaveBeenCalledTimes(1));
    const elsewhere = screen.getByRole("textbox", { name: "elsewhere" });
    elsewhere.focus();
    rerender(
      wrap(
        <>
          <input aria-label="elsewhere" />
          <GroupMembershipStrip group={group(true)} />
        </>,
      ),
    );

    expect(document.activeElement).toBe(elsewhere);
  });

  it("control: a refresh with no press in the strip moves no focus", () => {
    const { rerender } = render(wrap(<GroupMembershipStrip group={group(false)} />));
    rerender(wrap(<GroupMembershipStrip group={group(true)} />));
    expect(document.activeElement).toBe(document.body);
  });

  it("control: a page that loads already a member announces nothing", () => {
    render(wrap(<GroupMembershipStrip group={group(true)} />));
    expect(live()).toHaveTextContent("");
  });

  it("a Hall says Hall", () => {
    const { rerender } = render(wrap(<GroupMembershipStrip group={group(false, { type: "hall" })} />));
    rerender(wrap(<GroupMembershipStrip group={group(true, { type: "hall" })} />));
    expect(live()).toHaveTextContent("You joined this Hall.");
  });
});
