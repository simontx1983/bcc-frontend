/**
 * F-426: the lightbox's "Jump to comments" scroll honours reduced motion.
 *
 * `scrollToComments` passed `behavior: "smooth"` unconditionally, so a
 * viewer who had asked the OS for reduced motion still got a long glide
 * down the theater sheet. It now asks the shared usePrefersReducedMotion
 * hook and passes "auto" (a jump) under `prefers-reduced-motion: reduce`,
 * staying smooth otherwise.
 *
 * The hook runs for real against a controllable matchMedia, so these
 * tests also cover the preference changing while the lightbox is open.
 * The rail, drawer and dialog are stand-ins: this file is about the scroll
 * call, not about what those components render.
 */

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("@/components/ui/Dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/identity/AuthorBadge", () => ({ AuthorBadge: () => null }));
vi.mock("@/components/feed/CommentDrawer", () => ({
  CommentDrawer: ({ feedId }: { feedId: string }) => (
    <textarea id={`comment-${feedId}`} aria-label="Write a comment" />
  ),
}));
vi.mock("@/components/feed/PostActionBar", () => ({
  PostActionBar: ({ onComment, commentTitle }: { onComment: () => void; commentTitle: string }) => (
    <button type="button" onClick={onComment}>
      {commentTitle}
    </button>
  ),
}));
vi.mock("@/hooks/useFeed", () => ({
  useFeedItem: (_id: string, seed: unknown) => ({ data: seed }),
}));

import { Lightbox } from "@/components/ui/Lightbox";
import type { FeedItem } from "@/lib/api/types";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

let reduce = false;
const listeners = new Set<(e: MediaQueryListEvent) => void>();
const scrollCalls: Array<{ el: Element; opts: ScrollIntoViewOptions | boolean | undefined }> = [];

beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    get matches() {
      return query === REDUCE_QUERY && reduce;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.add(cb);
    },
    removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
      listeners.delete(cb);
    },
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = function (this: Element, opts?: ScrollIntoViewOptions | boolean) {
    scrollCalls.push({ el: this, opts });
  };
});

beforeEach(() => {
  reduce = false;
  scrollCalls.length = 0;
});

afterEach(() => {
  cleanup();
  listeners.clear();
});

const ITEM = {
  id: "feed_7",
  post_kind: "photo",
  external_id: 700,
  posted_at: "2026-11-10T00:00:00Z",
  scope_tags: [],
  author: {
    user_id: 7,
    handle: "anvil",
    reputation_tier: "neutral",
    reputation_tier_label: "Neutral",
  },
  body: {},
  reactions: { kind_grammar: "social", counts: {}, viewer_reaction: null },
  comment_count: 3,
  permissions: {},
  links: { self: "/post/feed_7", author: "/u/anvil" },
} as unknown as FeedItem;

function renderLightbox() {
  // A non-WordPress host renders a plain <img>, keeping next/image out of it.
  render(
    <Lightbox item={ITEM} src="https://media.example/photo.gif" alt="A photo" onClose={() => undefined} />,
  );
  return screen.getByLabelText("Write a comment");
}

function jumpButtons() {
  return screen.getAllByRole("button", { name: "Jump to comments" });
}

describe("Lightbox — Jump to comments under reduced motion (F-426)", () => {
  it("provides the post location for a copyright concern", () => {
    renderLightbox();
    const href = screen.getByRole("link", { name: "Report a copyright concern" }).getAttribute("href");
    expect(decodeURIComponent(href ?? "")).toContain("/post/feed_7");
  });

  it("no preference: the jump still glides (smooth) and focuses the composer", () => {
    const composer = renderLightbox();
    fireEvent.click(jumpButtons()[0]!);
    expect(scrollCalls).toHaveLength(1);
    expect(scrollCalls[0]?.el).toBe(composer);
    expect(scrollCalls[0]?.opts).toMatchObject({ block: "center", behavior: "smooth" });
    expect(document.activeElement).toBe(composer);
  });

  it("reduced motion: the jump snaps (auto) and still focuses the composer", () => {
    reduce = true;
    const composer = renderLightbox();
    fireEvent.click(jumpButtons()[0]!);
    expect(scrollCalls).toHaveLength(1);
    expect(scrollCalls[0]?.el).toBe(composer);
    expect(scrollCalls[0]?.opts).toMatchObject({ block: "center", behavior: "auto" });
    expect(document.activeElement).toBe(composer);
  });

  it("both rails (mobile overlay and desktop strip) honour it", () => {
    reduce = true;
    renderLightbox();
    const buttons = jumpButtons();
    expect(buttons).toHaveLength(2);
    for (const b of buttons) fireEvent.click(b);
    expect(scrollCalls.map((c) => (c.opts as ScrollIntoViewOptions).behavior)).toEqual(["auto", "auto"]);
  });

  it("turning reduced motion on while the lightbox is open applies to the next jump", () => {
    renderLightbox();
    fireEvent.click(jumpButtons()[0]!);
    act(() => {
      reduce = true;
      for (const cb of listeners) cb({ matches: true, media: REDUCE_QUERY } as MediaQueryListEvent);
    });
    fireEvent.click(jumpButtons()[0]!);
    expect(scrollCalls.map((c) => (c.opts as ScrollIntoViewOptions).behavior)).toEqual(["smooth", "auto"]);
  });
});
