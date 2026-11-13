/**
 * F-245 frontend (UX scan 2026-11-12):
 *   - bcc-trust #660 links REACTION / MENTION / COMMENT_RECEIVED rows to
 *     /post/<act_id> and sends `target_available: false` when that post is
 *     gone or hidden. Such a row is greyed, says so, and a click only marks
 *     it read — it never opens a dead page.
 *   - H9: unread state is announced (the dot is aria-hidden).
 *   - H8: a failed mark-read is announced, keyed on the code.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

import { BccApiError } from "@/lib/api/types";

const push = vi.fn();
const onNavigate = vi.fn();
const markRead = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
  error: null as unknown,
}));
const state = vi.hoisted(() => ({ items: [] as unknown[] }));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    isLoading: false,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    isFetchNextPageError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    data: { pages: [{ items: state.items }] },
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  }),
  useUnreadCount: () => ({ data: { unread_count: 0 } }),
  useMarkReadMutation: () => markRead,
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));

import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

function note(id: number, extra: Record<string, unknown> = {}) {
  return {
    id,
    type: "reaction",
    message: `Member ${id} reacted to your post`,
    created_at: "2026-11-12T12:00:00Z",
    read: false,
    actor: { id: 1000 + id, handle: `m${id}`, display_name: `M${id}`, avatar_url: "" },
    link: `/post/${500 + id}`,
    ...extra,
  };
}

const renderPanel = () =>
  render(<NotificationsPanel enabled open onNavigate={onNavigate} />);

beforeEach(() => {
  push.mockReset();
  onNavigate.mockReset();
  markRead.mutate.mockReset();
  markRead.isError = false;
  markRead.error = null;
  state.items = [];
});
afterEach(() => cleanup());

describe("a row whose post is gone (target_available: false)", () => {
  it("is greyed, says so, and a click only marks it read", () => {
    state.items = [note(1, { target_available: false })];
    renderPanel();
    const row = screen.getByRole("button", { name: /Member 1 reacted/ });
    expect(row).toHaveAccessibleDescription("This post is no longer available.");
    fireEvent.click(row);
    expect(markRead.mutate).toHaveBeenCalledWith(1);
    expect(push).not.toHaveBeenCalled();
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("control: an available row opens its /post/<act_id> link", () => {
    state.items = [note(2, { target_available: true })];
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Member 2 reacted/ }));
    expect(push).toHaveBeenCalledWith("/post/502");
  });

  it("an older backend without the field still navigates", () => {
    state.items = [note(3)];
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Member 3 reacted/ }));
    expect(push).toHaveBeenCalledWith("/post/503");
  });
});

describe("H9 — unread is announced", () => {
  it("an unread row's name starts with Unread:, a read one's does not", () => {
    state.items = [note(4), note(5, { read: true })];
    renderPanel();
    expect(screen.getByRole("button", { name: /^Unread: Member 4 reacted/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Member 5 reacted/ })).toBeInTheDocument();
  });
});

describe("H8 — a failed mark-read is announced", () => {
  it("shows code-keyed copy, never the server message", () => {
    state.items = [note(6)];
    markRead.isError = true;
    markRead.error = new BccApiError("bcc_internal_error", "RAW SERVER TEXT", 500, null);
    renderPanel();
    expect(screen.getByRole("alert")).toHaveTextContent("Couldn’t mark these as read. Try again.");
    expect(screen.queryByText(/RAW SERVER TEXT/)).toBeNull();
  });

  it("no failure, no alert", () => {
    state.items = [note(7)];
    renderPanel();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
