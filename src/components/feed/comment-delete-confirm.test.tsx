/**
 * Deleting a feed comment confirms first, and a failure is visible.
 *
 * The delete was one click from the overflow menu, and its only failure
 * signal was the comment silently reappearing when the optimistic removal
 * rolled back. The confirmation is held at THREAD level for exactly that
 * reason: the row unmounts the moment the optimistic removal lands, so a
 * dialog owned by the row could never report the failure.
 *
 * Real React Query + the real delete mutation, stubbed endpoints.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type Comment } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: 7 } } }),
  getSession: async () => ({ user: { id: 7 } }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

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
vi.mock("@/hooks/useCommentStoke", () => ({
  useCommentStoke: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useGiphyIntegration", () => ({
  useGiphyIntegration: () => ({ enabled: false }),
}));

const { CommentDrawer } = await import("@/components/feed/CommentDrawer");

const COMMENT: Comment = {
  id: "comment_1",
  comment_id: "comment_1",
  feed_id: "feed_1",
  author: {
    id: 7,
    handle: "anvil",
    display_name: "Anvil",
    avatar_url: "",
    reputation_tier: "neutral",
    reputation_tier_label: "Neutral",
  },
  body: "measured words",
  mentions: [],
  posted_at: "2026-11-10T00:00:00Z",
  permissions: { can_delete: { allowed: true, unlock_hint: null } },
} as Comment;

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
  api.listComments.mockResolvedValue({ items: [COMMENT], next_cursor: null });
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
});

async function openDelete() {
  render(
    <QueryClientProvider client={client}>
      <CommentDrawer feedId="feed_1" isOpen />
    </QueryClientProvider>,
  );
  await screen.findByText("measured words");
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  return screen.getByRole("dialog", { name: "Delete this comment?" });
}

describe("CommentDrawer delete", () => {
  it("Delete opens a confirmation and sends nothing", async () => {
    const dialog = await openDelete();
    expect(within(dialog).getByRole("button", { name: "DELETE" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "CANCEL" })).toBeInTheDocument();
    expect(api.deleteComment).not.toHaveBeenCalled();
    // The comment is still on screen — nothing optimistic has happened.
    expect(screen.getByText("measured words")).toBeInTheDocument();
  });

  it("confirming deletes and closes", async () => {
    api.deleteComment.mockResolvedValue({ comment_id: "comment_1" });
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByRole("button", { name: "DELETE" }));
    await waitFor(() =>
      expect(api.deleteComment).toHaveBeenCalledWith({ feedId: "feed_1", commentId: "comment_1" }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("CANCEL sends nothing", async () => {
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByRole("button", { name: "CANCEL" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.deleteComment).not.toHaveBeenCalled();
  });

  it("a failure survives the optimistic rollback and shows in the dialog", async () => {
    api.deleteComment.mockRejectedValue(
      new BccApiError("bcc_forbidden", "raw server prose", 403, null),
    );
    const dialog = await openDelete();
    fireEvent.click(within(dialog).getByRole("button", { name: "DELETE" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("You can only delete your own comments.");
    expect(alert.className).toContain("text-bcc-text-error");
    expect(screen.queryByText(/raw server prose/)).toBeNull();
    // Rolled back: the comment is back under the still-open dialog.
    expect(await screen.findByText("measured words")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "TRY AGAIN" })).toBeEnabled();
  });
});
