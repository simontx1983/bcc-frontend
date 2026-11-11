import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * A confirmed delete must remove the post from EVERY listing it can be
 * cached in. The hook used to filter only the main ["feed", …] namespace,
 * so the deleted row stayed in group/Hall streams (["groups","feed", …])
 * and on profile walls (["users","activity", handle]); clicking it opened
 * a detail route that 404s.
 */

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
  getSession: async () => null,
}));

const deleteFeedItem = vi.fn();
vi.mock("@/lib/api/feed-endpoints", () => ({
  deleteFeedItem: (...a: unknown[]) => deleteFeedItem(...a),
}));

import { useDeletePostMutation } from "@/hooks/useDeletePost";
import { FEED_ITEM_QUERY_KEY, FEED_QUERY_KEY_ROOT } from "@/hooks/useFeed";
import { GROUP_FEED_QUERY_KEY_ROOT } from "@/hooks/useGroupFeed";
import { USER_ACTIVITY_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";
import type { FeedItem, FeedResponse } from "@/lib/api/types";

function makeItem(id: string): FeedItem {
  return {
    id,
    post_kind: "status",
    external_id: 100,
    posted_at: "2026-11-10T00:00:00Z",
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
    comment_count: 0,
    permissions: {},
    links: { self: `/post/${id}`, author: "/u/anvil" },
  };
}

function makePages(ids: string[]): InfiniteData<FeedResponse> {
  return {
    pages: [{ items: ids.map(makeItem), pagination: { next_cursor: null, has_more: false } }],
    pageParams: [null],
  };
}

const MAIN_KEY = [...FEED_QUERY_KEY_ROOT, "for_you"];
const GROUP_KEY = [...GROUP_FEED_QUERY_KEY_ROOT, 42, "new"];
const WALL_KEY = [...USER_ACTIVITY_QUERY_KEY_ROOT, "anvil"];

function idsAt(qc: QueryClient, key: readonly unknown[]): string[] {
  const data = qc.getQueryData<InfiniteData<FeedResponse>>(key);
  return data?.pages.flatMap((page) => page.items.map((item) => item.id)) ?? [];
}

describe("useDeletePostMutation", () => {
  it("removes the post from the main feed, group streams, profile walls and the detail cache", async () => {
    deleteFeedItem.mockResolvedValue({ ok: true, feed_id: "f1" });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    for (const key of [MAIN_KEY, GROUP_KEY, WALL_KEY]) {
      qc.setQueryData(key, makePages(["f1", "f2"]));
    }
    qc.setQueryData(FEED_ITEM_QUERY_KEY("f1"), makeItem("f1"));

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useDeletePostMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("f1");
    });

    expect(idsAt(qc, MAIN_KEY)).toEqual(["f2"]);
    expect(idsAt(qc, GROUP_KEY)).toEqual(["f2"]);
    expect(idsAt(qc, WALL_KEY)).toEqual(["f2"]);
    expect(qc.getQueryData(FEED_ITEM_QUERY_KEY("f1"))).toBeUndefined();
  });
});
