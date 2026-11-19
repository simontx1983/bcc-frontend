/**
 * M-no1 (UX scan): the notifications panel was role="menu" with each row a
 * role="menuitem" wrapping a <button>. A menu promises arrow-key movement
 * over menuitems only, and this panel also holds Mark all read, LOAD MORE
 * and retry; a menuitem around a button nests one interactive role in
 * another. It is now a named list whose items are the notification rows,
 * with the controls outside the list.
 */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const state = vi.hoisted(() => ({ items: [] as unknown[], hasNextPage: true }));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    isLoading: false,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    isFetchNextPageError: false,
    hasNextPage: state.hasNextPage,
    isFetchingNextPage: false,
    data: { pages: [{ items: state.items }] },
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  }),
  useUnreadCount: () => ({ data: { unread_count: 5 } }),
  useMarkReadMutation: () => ({ mutate: vi.fn(), isPending: false, isError: false, error: null }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));

import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

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

afterEach(() => cleanup());

describe("M-no1 — notifications are a list, not a menu", () => {
  it("a named list whose items are exactly the notification rows", () => {
    state.items = [note(1), note(2), note(3)];
    render(<NotificationsPanel enabled open onNavigate={vi.fn()} />);
    const list = screen.getByRole("list", { name: "Notifications" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(3);
    expect(within(rows[0] as HTMLElement).getByRole("button", { name: /Member 1 reacted/ })).toBeInTheDocument();
  });

  it("no menu or menuitem roles anywhere in the panel", () => {
    state.items = [note(1)];
    render(<NotificationsPanel enabled open onNavigate={vi.fn()} />);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryAllByRole("menuitem")).toHaveLength(0);
  });

  it("LOAD MORE and Mark all read sit outside the list", () => {
    state.items = [note(1), note(2)];
    state.hasNextPage = true;
    render(<NotificationsPanel enabled open onNavigate={vi.fn()} />);
    const list = screen.getByRole("list", { name: "Notifications" });
    const loadMore = screen.getByRole("button", { name: "LOAD MORE" });
    const markAll = screen.getByRole("button", { name: "Mark all read" });
    expect(list.contains(loadMore)).toBe(false);
    expect(list.contains(markAll)).toBe(false);
  });
});
