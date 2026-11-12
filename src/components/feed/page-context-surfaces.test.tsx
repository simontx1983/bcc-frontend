/**
 * `page_context` has to read the same on every surface a post appears on.
 * FeedItemCard renders the feeds; the permalink has its own renderer, which
 * is the one that gets forgotten.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { FeedItem } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
  getSession: async () => null,
  signOut: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/post/feed_1",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/feed/CommentDrawer", () => ({ CommentDrawer: () => null }));

const { FeedItemCard } = await import("@/components/feed/FeedItemCard");
const { PostDetail } = await import("@/components/feed/PostDetail");

const LABEL = "Operator of Fixture Validator";

function makeItem(pageContext: FeedItem["page_context"]): FeedItem {
  return {
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
    body: { text: "hello" },
    reactions: {
      kind_grammar: "social",
      counts: {},
      viewer_reaction: null,
      viewer_has_stoked: false,
      stoke_count: 0,
    },
    permissions: {},
    links: { self: "/post/feed_1", author: "/u/anvil" },
    ...(pageContext !== undefined ? { page_context: pageContext } : {}),
  } as FeedItem;
}

const CONTEXT = {
  id: 35,
  name: "Fixture Validator",
  handle: "fixture-validator",
  url: "/v/fixture-validator",
  label: LABEL,
};

function mount(node: ReactNode) {
  return render(
    <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>,
  );
}

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

afterEach(cleanup);

describe.each([
  ["FeedItemCard", (item: FeedItem) => <FeedItemCard item={item} />],
  ["PostDetail", (item: FeedItem) => <PostDetail item={item} />],
])("%s", (_name, renderItem) => {
  it("links the server's label to the server's url", () => {
    mount(renderItem(makeItem(CONTEXT)));
    expect(screen.getByRole("link", { name: LABEL })).toHaveAttribute(
      "href",
      "/v/fixture-validator",
    );
  });

  it("renders nothing for a null page_context", () => {
    mount(renderItem(makeItem(null)));
    expect(screen.queryByText(LABEL)).toBeNull();
  });

  it("renders nothing on a backend that predates the field", () => {
    mount(renderItem(makeItem(undefined)));
    expect(screen.queryByText(LABEL)).toBeNull();
  });
});
