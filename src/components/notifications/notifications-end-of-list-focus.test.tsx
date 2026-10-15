/**
 * When LOAD MORE legitimately disappears, the keyboard user lands
 * somewhere — but only if they were standing on it.
 *
 * ## What this pins
 *
 * Distinct from the defect #186 fixed. That one was a control that was
 * still present being `disabled` mid-interaction, which blurs it. This is
 * the control being REMOVED because the list genuinely ended: measured in
 * a browser, activating LOAD MORE on the last page left
 * `document.activeElement` on `<body>`, at the bottom of a list that had
 * just grown — so reaching anything meant tabbing in from the top of the
 * document.
 *
 * ## Why the guard is the important half
 *
 * Moving focus unconditionally would be worse than the bug. A mouse user
 * scrolling elsewhere while the last page settles would have the page
 * yanked out from under them, and a first render that simply has no next
 * page would steal focus on arrival. So the fix is bounded: focus moves
 * ONLY when the control held focus at the moment it was activated, and
 * that fact is recorded at click time rather than in an effect — by the
 * time an effect runs the button may already be gone and the browser may
 * already have moved focus to `<body>`, which is exactly the state being
 * repaired.
 *
 * ## Why there is no live region
 *
 * This panel has none, and the landing node deliberately does not add one.
 * The reading happens because focus MOVES to the node, which is one
 * announcement rather than two. A `role="status"` here would be a second.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const fetchNextPage = vi.fn();
const refetch = vi.fn();
const state = vi.hoisted(() => ({ list: null as unknown }));

vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => state.list,
  useUnreadCount: () => ({ data: { unread_count: 0 } }),
  useMarkReadMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

function note(id: number) {
  return {
    id,
    type: "mention",
    message: "Member " + id + " mentioned you",
    created_at: "2026-10-01T12:00:00Z",
    read: true,
    actor: { id: 1000 + id, handle: "m" + id, display_name: "M" + id, avatar_url: "" },
    link: null,
  };
}

const listState = (over: Record<string, unknown> = {}) => ({
  isPending: false,
  isLoading: false,
  isError: false,
  isLoadingError: false,
  isRefetchError: false,
  isFetchNextPageError: false,
  isFetching: false,
  isFetchingNextPage: false,
  error: null,
  data: { pages: [{ items: [note(1), note(2)] }] },
  hasNextPage: true,
  fetchNextPage,
  refetch,
  ...over,
});

beforeEach(() => {
  fetchNextPage.mockClear();
  refetch.mockClear();
  state.list = listState();
});

afterEach(cleanup);

const ui = () => render(<NotificationsPanel enabled open onNavigate={() => {}} />);
const loadMore = () => screen.queryByRole("button", { name: /^LOAD MORE$/i });
const endNode = () => screen.queryByTestId("notifications-end-of-list");

describe("the control held focus and then vanished", () => {
  it("moves focus to the end-of-list node", () => {
    const view = ui();
    const btn = loadMore() as HTMLElement;
    btn.focus();
    expect(document.activeElement).toBe(btn);

    fireEvent.click(btn);

    // The page lands and there is no next page: the control is removed.
    state.list = listState({ hasNextPage: false, data: { pages: [{ items: [note(1), note(2), note(3)] }] } });
    view.rerender(<NotificationsPanel enabled open onNavigate={() => {}} />);

    expect(loadMore()).toBeNull();
    expect(endNode()).not.toBeNull();
    expect(document.activeElement).toBe(endNode());
  });

  it("the landing node is focusable but not a tab stop", () => {
    state.list = listState({ hasNextPage: false });
    ui();
    expect(endNode()).toHaveAttribute("tabindex", "-1");
  });

  it("the landing node adds no live region", () => {
    // Focus does the announcing. A second mechanism would be a second
    // announcement, and this panel has no live region to compete with.
    state.list = listState({ hasNextPage: false });
    ui();
    const node = endNode() as HTMLElement;
    expect(node.getAttribute("aria-live")).toBeNull();
    expect(node.getAttribute("role")).toBeNull();
  });
});

describe("the guard — focus is not stolen", () => {
  it("does NOT move focus when the control never held it", () => {
    // A mouse user scrolling elsewhere while the last page settles.
    const view = ui();
    const btn = loadMore() as HTMLElement;
    document.body.focus();
    fireEvent.click(btn);          // clicked, but focus was not on it

    state.list = listState({ hasNextPage: false });
    view.rerender(<NotificationsPanel enabled open onNavigate={() => {}} />);

    expect(endNode()).not.toBeNull();
    expect(document.activeElement).not.toBe(endNode());
  });

  it("does NOT steal focus on a first render that simply has no next page", () => {
    state.list = listState({ hasNextPage: false });
    ui();
    expect(endNode()).not.toBeNull();
    expect(document.activeElement).not.toBe(endNode());
  });

  it("does NOT move focus while the list is still growing", () => {
    const view = ui();
    const btn = loadMore() as HTMLElement;
    btn.focus();
    fireEvent.click(btn);

    // Another page arrived and there is still more: the control stays, and
    // #186's behaviour owns this case — focus belongs on the button.
    state.list = listState({ hasNextPage: true, data: { pages: [{ items: [note(1), note(2), note(3)] }] } });
    view.rerender(<NotificationsPanel enabled open onNavigate={() => {}} />);

    expect(loadMore()).not.toBeNull();
    expect(endNode()).toBeNull();
    expect(document.activeElement).toBe(loadMore());
  });

  it("does not fire twice for one activation", () => {
    const view = ui();
    const btn = loadMore() as HTMLElement;
    btn.focus();
    fireEvent.click(btn);

    state.list = listState({ hasNextPage: false });
    view.rerender(<NotificationsPanel enabled open onNavigate={() => {}} />);
    const landed = endNode();
    expect(document.activeElement).toBe(landed);

    // Move focus away — to a REAL focusable element, because `body.focus()`
    // is a no-op in jsdom and would make this pass for the wrong reason.
    const row = screen.getAllByRole("menuitem")[0]?.querySelector("button");
    (row as HTMLElement).focus();
    expect(document.activeElement).toBe(row);

    // A later unrelated re-render must not drag focus back.
    view.rerender(<NotificationsPanel enabled open onNavigate={() => {}} />);
    expect(document.activeElement).toBe(row);
  });
});

describe("the end-of-list claim is withheld when the read failed", () => {
  it("shows no end-of-list node while the query is in error", () => {
    // "That is everything" is a claim about the server, and a failed read
    // does not support it — the same rule the empty state follows.
    state.list = listState({
      hasNextPage: false,
      isError: true,
      isFetchNextPageError: true,
      error: null,
    });
    ui();
    expect(endNode()).toBeNull();
  });
});

describe("#186's in-flight behaviour is untouched", () => {
  it("keeps the control focusable while fetching", () => {
    state.list = listState({ isFetchingNextPage: true });
    ui();
    const btn = screen.getByRole("button", { name: /LOADING/i });
    expect(btn).not.toBeDisabled();
    expect(btn).toHaveAttribute("aria-busy", "true");
  });

  it("still refuses a second fetch while one is running", () => {
    state.list = listState({ isFetchingNextPage: true });
    ui();
    fireEvent.click(screen.getByRole("button", { name: /LOADING/i }));
    expect(fetchNextPage).not.toHaveBeenCalled();
  });
});
