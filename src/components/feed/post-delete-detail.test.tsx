/**
 * H8 + M1 — deleting your own post confirms in the shared ConfirmDialog,
 * shows a failure there, and on the post page says "Post deleted" instead
 * of leaving the post on screen.
 *
 * Before: Delete was a second tap on the same 11px menu item; on error the
 * menu just closed (no message); and on the permalink page the post stayed
 * visible after a successful delete, because PostDetail renders from its
 * server-seeded data while the delete only cleared the cache entry.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import * as FeedEndpoints from "@/lib/api/feed-endpoints";
import { BccApiError, type FeedItem } from "@/lib/api/types";

const DECOY = "SERVER MESSAGE THAT MUST NEVER RENDER";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: 7 } }, status: "authenticated" }),
  getSession: async () => ({ user: { id: 7 } }),
  signOut: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/post/feed_1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/feed/CommentDrawer", () => ({ CommentDrawer: () => null }));

const deleteFeedItem = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/feed-endpoints", async (importOriginal) => ({
  ...(await importOriginal<typeof FeedEndpoints>()),
  deleteFeedItem: (...a: unknown[]) => deleteFeedItem(...a),
}));

const { PostDetail } = await import("@/components/feed/PostDetail");

const ITEM = {
  id: "feed_1",
  post_kind: "status",
  external_id: 100,
  posted_at: "2026-11-05T00:00:00Z",
  scope_tags: [],
  author: {
    user_id: 7,
    handle: "anvil",
    reputation_tier: "neutral",
    reputation_tier_label: "Neutral",
  },
  body: { text: "my own words" },
  reactions: {
    kind_grammar: "social",
    counts: {},
    viewer_reaction: null,
    viewer_has_stoked: false,
    stoke_count: 0,
  },
  permissions: { can_delete: { allowed: true, unlock_hint: null } },
  links: { self: "/post/feed_1", author: "/u/anvil" },
} as unknown as FeedItem;

let qc: QueryClient;

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

beforeEach(() => {
  deleteFeedItem.mockReset();
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
});

afterEach(() => {
  cleanup();
  qc.clear();
});

function openDelete() {
  render(
    <QueryClientProvider client={qc}>
      <PostDetail item={ITEM} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "More actions" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));
  return screen.getByRole("dialog", { name: "Delete this post?" });
}

describe("PostDetail — delete your own post", () => {
  it("Delete asks first and sends nothing", () => {
    const dialog = openDelete();
    expect(within(dialog).getByRole("button", { name: "DELETE" })).toBeInTheDocument();
    expect(deleteFeedItem).not.toHaveBeenCalled();
    expect(screen.getByText("my own words")).toBeInTheDocument();
  });

  it("CANCEL closes and sends nothing", () => {
    const dialog = openDelete();
    fireEvent.click(within(dialog).getByRole("button", { name: "CANCEL" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(deleteFeedItem).not.toHaveBeenCalled();
  });

  it("on success the post is replaced by 'Post deleted', with focus on it", async () => {
    deleteFeedItem.mockResolvedValue({ ok: true, feed_id: "feed_1" });
    const dialog = openDelete();
    fireEvent.click(within(dialog).getByRole("button", { name: "DELETE" }));

    const heading = await screen.findByRole("heading", { name: "Post deleted" });
    expect(deleteFeedItem).toHaveBeenCalledWith("feed_1");
    expect(screen.queryByText("my own words")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("link", { name: /back to the floor/i })).toHaveAttribute("href", "/");
    expect(document.activeElement).toBe(heading);
  });

  it("on failure the dialog says why (by code), offers TRY AGAIN, and the post stays", async () => {
    deleteFeedItem.mockRejectedValue(new BccApiError("bcc_forbidden", DECOY, 403, null));
    const dialog = openDelete();
    fireEvent.click(within(dialog).getByRole("button", { name: "DELETE" }));

    await waitFor(() =>
      expect(within(dialog).getByText("You can only delete your own posts.")).toBeInTheDocument(),
    );
    expect(within(dialog).getByRole("button", { name: "TRY AGAIN" })).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain(DECOY);
    expect(screen.getByText("my own words")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Post deleted" })).toBeNull();
  });
});
