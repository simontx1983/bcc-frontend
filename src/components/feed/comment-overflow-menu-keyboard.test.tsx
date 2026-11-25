/**
 * The comment "⋯" menu works from the keyboard (F-264 follow-up).
 *
 * It handled only Escape, through a window listener: no arrow keys and no
 * roving focus. It now uses the shared menu-button contract
 * (useMenuButton, as the post menu and ActionMenu do), markup unchanged.
 * Report and Copy link stay "coming soon" (aria-disabled, inert) but are
 * reachable, so the menu still opens for a viewer who can't delete. Escape
 * in the open menu closes the menu only, never a dialog around it (the
 * Lightbox hosts this drawer).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { Comment } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: 7 } } }),
  getSession: async () => ({ user: { id: 7 } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => "/u/anvil" }));

const api = vi.hoisted(() => ({ listComments: vi.fn(), deleteComment: vi.fn() }));
vi.mock("@/lib/api/comment-endpoints", () => ({
  listComments: (...a: unknown[]) => api.listComments(...a),
  deleteComment: (...a: unknown[]) => api.deleteComment(...a),
  createComment: vi.fn(),
  setCommentStoke: vi.fn(),
  removeCommentStoke: vi.fn(),
}));
// The overflow menu rides in AuthorBadge's `trailing` slot; render only that.
vi.mock("@/components/identity/AuthorBadge", () => ({
  AuthorBadge: ({ trailing }: { trailing?: ReactNode }) => <div>{trailing}</div>,
}));
vi.mock("@/components/feed/HelpfulButton", () => ({ CommentHelpfulButton: () => null }));
vi.mock("@/hooks/useCommentStoke", () => ({ useCommentStoke: () => ({ mutate: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/useGiphyIntegration", () => ({ useGiphyIntegration: () => ({ enabled: false }) }));

const { CommentDrawer } = await import("@/components/feed/CommentDrawer");
const { Dialog } = await import("@/components/ui/Dialog");

const comment = (canDelete: boolean): Comment =>
  ({
    id: "comment_1",
    comment_id: "comment_1",
    feed_id: "feed_1",
    author: {
      id: 7, handle: "anvil", display_name: "Anvil", avatar_url: "",
      reputation_tier: "neutral", reputation_tier_label: "Neutral",
    },
    body: "measured words",
    mentions: [],
    posted_at: "2026-11-10T00:00:00Z",
    permissions: canDelete ? { can_delete: { allowed: true, unlock_hint: null } } : {},
  }) as Comment;

let client: QueryClient;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});
afterEach(() => {
  cleanup();
  client.clear();
});

async function drawer(canDelete: boolean, wrap?: (ui: ReactNode) => ReactNode) {
  api.listComments.mockResolvedValue({ items: [comment(canDelete)], next_cursor: null });
  const ui = <CommentDrawer feedId="feed_1" isOpen />;
  render(<QueryClientProvider client={client}>{wrap ? wrap(ui) : ui}</QueryClientProvider>);
  await screen.findByText("measured words");
}

const trigger = () => screen.getByRole("button", { name: "More actions" });
const menu = () => screen.getByRole("menu", { name: "More actions" });
const item = (name: string) => screen.getByRole("menuitem", { name });
const key = (el: Element, k: string) => fireEvent.keyDown(el, { key: k });

describe("the comment ⋯ menu from the keyboard", () => {
  it("Enter opens at the first item; the menu is named and controlled by ⋯", async () => {
    await drawer(true);
    key(trigger(), "Enter");
    expect(trigger()).toHaveAttribute("aria-expanded", "true");
    expect(trigger()).toHaveAttribute("aria-controls", menu().id);
    expect(item("Report")).toHaveFocus();
    expect(item("Report")).toHaveAttribute("aria-disabled", "true");
  });

  it("arrows reach every item, the inert ones too, and wrap; one tab stop", async () => {
    await drawer(true);
    key(trigger(), "Enter");
    expect(item("Report")).toHaveAttribute("tabindex", "0");
    expect(item("Copy link")).toHaveAttribute("tabindex", "-1");
    expect(item("Delete")).toHaveAttribute("tabindex", "-1");
    key(menu(), "ArrowDown");
    expect(item("Copy link")).toHaveFocus();
    key(menu(), "ArrowDown");
    expect(item("Delete")).toHaveFocus();
    key(menu(), "ArrowDown");
    expect(item("Report")).toHaveFocus();
    key(menu(), "End");
    expect(item("Delete")).toHaveFocus();
    key(menu(), "Home");
    expect(item("Report")).toHaveFocus();
  });

  it("ArrowUp opens at the last item", async () => {
    await drawer(true);
    key(trigger(), "ArrowUp");
    expect(item("Delete")).toHaveFocus();
  });

  it("a viewer who can't delete still gets the menu (two inert items), as before", async () => {
    await drawer(false);
    key(trigger(), "Enter");
    expect(screen.getAllByRole("menuitem")).toHaveLength(2);
    expect(item("Report")).toHaveFocus();
    key(menu(), "ArrowDown");
    expect(item("Copy link")).toHaveFocus();
    key(menu(), "ArrowDown");
    expect(item("Report")).toHaveFocus();
    // Inert: activating one does nothing and keeps the menu open.
    fireEvent.click(item("Copy link"));
    expect(menu()).toBeInTheDocument();
  });

  it("Escape closes and puts focus back on ⋯; Tab and an outside press close too", async () => {
    await drawer(true);
    key(trigger(), "Enter");
    key(menu(), "Escape");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(trigger()).toHaveFocus();
    key(trigger(), "Enter");
    key(menu(), "Tab");
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(trigger());
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("inside a dialog (the Lightbox), Escape closes the menu only; the next one closes the dialog", async () => {
    const onClose = vi.fn();
    await drawer(true, (ui) => (
      <Dialog title="Post" onClose={onClose}>
        {ui}
      </Dialog>
    ));
    key(trigger(), "Enter");
    key(menu(), "Escape");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    key(trigger(), "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Delete from the keyboard opens the confirm, and cancelling puts focus back on ⋯", async () => {
    await drawer(true);
    key(trigger(), "ArrowUp");
    fireEvent.click(item("Delete"));
    expect(screen.queryByRole("menu")).toBeNull();
    const dialog = screen.getByRole("dialog", { name: "Delete this comment?" });
    expect(dialog).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "CANCEL" }));
    expect(screen.queryByRole("dialog", { name: "Delete this comment?" })).toBeNull();
    expect(trigger()).toHaveFocus();
    expect(api.deleteComment).not.toHaveBeenCalled();
  });
});
