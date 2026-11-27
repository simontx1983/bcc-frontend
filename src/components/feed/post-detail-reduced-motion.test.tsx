/**
 * F-426 — on the post page, the comment action jumps to the composer. With
 * prefers-reduced-motion set, that jump must not animate (behavior "auto"),
 * matching BioEditor and ModerationQueue. Without it, it stays smooth.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { FeedItem } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { id: 9 } }, status: "authenticated" }),
  getSession: async () => ({ user: { id: 9 } }),
  signOut: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/post/feed_1",
  useSearchParams: () => new URLSearchParams(),
}));
// The real drawer fetches; all this test needs is the composer it targets.
vi.mock("@/components/feed/CommentDrawer", () => ({
  CommentDrawer: ({ feedId }: { feedId: string }) => <textarea id={`comment-${feedId}`} aria-label="composer" />,
}));

const reduced = vi.hoisted(() => ({ value: false }));
vi.mock("@/hooks/usePrefersReducedMotion", () => ({ usePrefersReducedMotion: () => reduced.value }));

const { PostDetail } = await import("@/components/feed/PostDetail");

const ITEM = {
  id: "feed_1",
  post_kind: "status",
  external_id: 100,
  posted_at: "2026-11-05T00:00:00Z",
  scope_tags: [],
  author: { user_id: 7, handle: "anvil", reputation_tier: "neutral", reputation_tier_label: "Neutral" },
  body: { text: "words" },
  reactions: {
    kind_grammar: "social",
    counts: {},
    viewer_reaction: null,
    viewer_has_stoked: false,
    stoke_count: 0,
  },
  comment_count: 0,
  permissions: {},
  links: { self: "/post/feed_1", author: "/u/anvil" },
} as unknown as FeedItem;

const scrollIntoView = vi.fn();

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  // jsdom has no scrollIntoView.
  Element.prototype.scrollIntoView = scrollIntoView;
});
beforeEach(() => scrollIntoView.mockReset());
afterEach(cleanup);

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  render(
    <QueryClientProvider client={qc}>
      <PostDetail item={ITEM} />
    </QueryClientProvider>,
  );
}

describe("PostDetail — jump to the composer (F-426)", () => {
  it("does not animate the scroll under prefers-reduced-motion", () => {
    reduced.value = true;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Jump to the composer" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "auto" });
    expect(document.activeElement).toBe(screen.getByLabelText("composer"));
  });

  it("keeps the smooth scroll otherwise", () => {
    reduced.value = false;
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Jump to the composer" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
  });
});
