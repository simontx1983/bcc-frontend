/**
 * F-318 (UX scan notifications Mediums):
 *   M-no3 the list never refetched, so an open panel / the page disagreed
 *         with the polling badge: a RISE in the badge refetches the list.
 *   M-no5 a bare "Loading…" and a dead-end "Nothing on file.": skeleton
 *         rows, and the empty state links to notification settings.
 *   M-no6 "Mark all read" was a ~15px target: now 44px.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const state = vi.hoisted(() => ({
  items: [] as unknown[],
  isLoading: false,
  badge: undefined as number | undefined,
  refetch: vi.fn(),
}));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    isLoading: state.isLoading,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    data: state.isLoading ? undefined : { pages: [{ items: state.items }] },
    refetch: state.refetch,
    fetchNextPage: vi.fn(),
  }),
  useUnreadCount: () => ({
    data: state.badge === undefined ? undefined : { unread_count: state.badge },
  }),
  useMarkReadMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));

import {
  NOTIFICATION_SETTINGS_HREF,
  NotificationsPanel,
} from "@/components/notifications/NotificationsPanel";

function note(id: number) {
  return {
    id,
    type: "reaction",
    message: `Member ${id} reacted to your post`,
    created_at: "2026-11-12T12:00:00Z",
    read: false,
    actor: { id: 1000 + id, handle: `m${id}`, display_name: `M${id}`, avatar_url: "" },
    link: `/post/${500 + id}`,
  };
}

const onNavigate = vi.fn();
const panel = (open = true) => <NotificationsPanel enabled open={open} onNavigate={onNavigate} />;

beforeEach(() => {
  state.items = [note(1)];
  state.isLoading = false;
  state.badge = undefined;
  state.refetch.mockReset();
  onNavigate.mockReset();
});
afterEach(() => cleanup());

describe("M-no3 — the list follows the badge", () => {
  it("a rise in the badge while open refetches the list", () => {
    state.badge = 1;
    const { rerender } = render(panel());
    expect(state.refetch).not.toHaveBeenCalled();
    state.badge = 3;
    rerender(panel());
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it("the badge's first load, a fall, or a closed panel do not refetch", () => {
    const { rerender } = render(panel());
    state.badge = 4; // first load of the badge
    rerender(panel());
    state.badge = 2; // the viewer marked some read
    rerender(panel());
    expect(state.refetch).not.toHaveBeenCalled();
    state.badge = 9; // a rise, but the panel is closed
    rerender(panel(false));
    expect(state.refetch).not.toHaveBeenCalled();
  });
});

describe("M-no5 — loading and empty states", () => {
  it("loading shows row placeholders, not a bare word", () => {
    state.isLoading = true;
    render(panel());
    expect(screen.getByText("Loading notifications…")).toHaveClass("sr-only");
    expect(screen.queryByText("Loading…")).toBeNull();
  });

  it("the empty state links to notification settings and closes the pop-up", () => {
    state.items = [];
    render(panel());
    const link = screen.getByRole("link", { name: "Notification settings" });
    expect(link).toHaveAttribute("href", NOTIFICATION_SETTINGS_HREF);
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });
});

describe("M-no6 — Mark all read is a real target", () => {
  it("is at least 44px tall", () => {
    state.badge = 5;
    state.items = [note(1), note(2), note(3)];
    render(panel());
    expect(screen.getByRole("button", { name: "Mark all read" })).toHaveClass("min-h-[44px]");
  });
});
