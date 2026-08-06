import { QueryClient } from "@tanstack/react-query";
import type { InfiniteData } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";

// Transitive module-load requirements only (the typed API client reads
// clientEnv at import; the feed hooks import next-auth/react). Nothing
// in this test executes either.
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
  getSession: async () => null,
}));

import { patchFeedItem, snapshotFeed } from "@/hooks/useFeedCache";
import { FEED_ITEM_QUERY_KEY } from "@/hooks/useFeed";
import { GROUP_FEED_QUERY_KEY_ROOT } from "@/hooks/useGroupFeed";
import type { FeedItem, FeedReactions, FeedResponse } from "@/lib/api/types";

/**
 * Regression pin for the group-stream patch gap (2026-08-06): Stoke's
 * optimistic path patched only the ["feed", …] namespace, so a Stoke
 * fired inside a community stream (["groups","feed", …]) recorded
 * server-side but stayed visually inert until refetch. patchFeedItem
 * must write — and snapshotFeed must capture — BOTH page namespaces,
 * mirroring the helpful-mark fix that landed first.
 */

const baseReactions = (): FeedReactions => ({
  kind_grammar: "social",
  counts: {},
  viewer_reaction: null,
  viewer_has_stoked: false,
  stoke_count: 3,
});

const stokedReactions = (): FeedReactions => ({
  kind_grammar: "social",
  counts: {},
  viewer_reaction: null,
  viewer_has_stoked: true,
  stoke_count: 4,
});

function makeItem(id: string): FeedItem {
  return {
    id,
    post_kind: "status",
    external_id: 100,
    posted_at: "2026-08-06T00:00:00Z",
    scope_tags: [],
    author: {
      user_id: 7,
      handle: "anvil",
      reputation_tier: "neutral",
      reputation_tier_label: "Neutral",
    },
    body: { text: "hello" },
    reactions: baseReactions(),
    comment_count: 0,
    permissions: {},
    links: { self: "/post/abc", author: "/u/anvil" },
  };
}

function makePage(itemIds: string[]): InfiniteData<FeedResponse> {
  return {
    pages: [
      {
        items: itemIds.map(makeItem),
        pagination: { next_cursor: null, has_more: false },
      },
    ],
    pageParams: [null],
  };
}

const GROUP_STREAM_KEY = [...GROUP_FEED_QUERY_KEY_ROOT, 42, "new"];

describe("patchFeedItem group-stream coverage", () => {
  it("patches the item inside a ['groups','feed'] infinite query", () => {
    const qc = new QueryClient();
    qc.setQueryData(GROUP_STREAM_KEY, makePage(["f1", "f2"]));

    patchFeedItem(qc, "f1", () => stokedReactions());

    const data = qc.getQueryData<InfiniteData<FeedResponse>>(GROUP_STREAM_KEY);
    const patched = data?.pages[0]?.items.find((item) => item.id === "f1");
    const untouched = data?.pages[0]?.items.find((item) => item.id === "f2");
    expect(patched?.reactions.viewer_has_stoked).toBe(true);
    expect(patched?.reactions.stoke_count).toBe(4);
    expect(untouched?.reactions.viewer_has_stoked).toBe(false);
  });

  it("patches the ['feedItem', id] detail cache alongside the stream", () => {
    const qc = new QueryClient();
    qc.setQueryData(FEED_ITEM_QUERY_KEY("f1"), makeItem("f1"));

    patchFeedItem(qc, "f1", () => stokedReactions());

    const detail = qc.getQueryData<FeedItem>(FEED_ITEM_QUERY_KEY("f1"));
    expect(detail?.reactions.viewer_has_stoked).toBe(true);
  });

  it("snapshotFeed captures group-stream pages so an error can roll back", () => {
    const qc = new QueryClient();
    qc.setQueryData(GROUP_STREAM_KEY, makePage(["f1"]));

    const context = snapshotFeed(qc, "f1");

    expect(
      context.snapshots.some(
        (snapshot) => JSON.stringify(snapshot.queryKey) === JSON.stringify(GROUP_STREAM_KEY),
      ),
    ).toBe(true);
  });
});
