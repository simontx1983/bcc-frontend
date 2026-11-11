import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * useCreateCommentMutation / useDeleteCommentMutation spread `...options`
 * AFTER their own callbacks, so a caller passing `onError` / `onSuccess`
 * silently REPLACED the hook's rollback and optimistic-row reconcile.
 * Both must now run: the hook's cache work AND the caller's callback.
 */

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
  getSession: async () => null,
}));

const createComment = vi.fn();
const deleteComment = vi.fn();
vi.mock("@/lib/api/comment-endpoints", () => ({
  listComments: vi.fn(),
  setCommentStoke: vi.fn(),
  removeCommentStoke: vi.fn(),
  createComment: (...a: unknown[]) => createComment(...a),
  deleteComment: (...a: unknown[]) => deleteComment(...a),
}));

import {
  commentsQueryKey,
  useCreateCommentMutation,
  useDeleteCommentMutation,
} from "@/hooks/useComments";
import type { Comment, CommentsResponse } from "@/lib/api/types";

const FEED_ID = "feed_1";
const LIST_KEY = [...commentsQueryKey(FEED_ID), "new"];

function makeComment(id: string): Comment {
  return {
    id,
    comment_id: id,
    feed_id: FEED_ID,
    author: {
      id: 7,
      handle: "anvil",
      display_name: "Anvil",
      avatar_url: "",
      reputation_tier: "neutral",
      reputation_tier_label: "Neutral",
    },
    body: `body ${id}`,
    mentions: [],
    posted_at: "2026-11-10T00:00:00Z",
    permissions: { can_delete: { allowed: true, unlock_hint: null } },
  };
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const seed: InfiniteData<CommentsResponse> = {
    pages: [{ items: [makeComment("comment_1")], next_cursor: null }],
    pageParams: [null],
  };
  qc.setQueryData(LIST_KEY, seed);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const ids = () =>
    qc
      .getQueryData<InfiniteData<CommentsResponse>>(LIST_KEY)
      ?.pages.flatMap((page) => page.items.map((item) => item.id));
  return { wrapper, ids };
}

describe("comment mutations compose caller callbacks with their own", () => {
  it("create: a caller onError does not replace the optimistic rollback", async () => {
    createComment.mockRejectedValue(new Error("boom"));
    const callerOnError = vi.fn();
    const { wrapper, ids } = setup();
    const { result } = renderHook(() => useCreateCommentMutation({ onError: callerOnError }), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync({ feed_id: FEED_ID, body: "hi" }).catch(() => undefined);
    });

    expect(ids()).toEqual(["comment_1"]);
    expect(callerOnError).toHaveBeenCalledTimes(1);
  });

  it("create: a caller onSuccess does not replace the optimistic-row reconcile", async () => {
    createComment.mockResolvedValue({ comment: makeComment("comment_2") });
    const callerOnSuccess = vi.fn();
    const { wrapper, ids } = setup();
    const { result } = renderHook(
      () => useCreateCommentMutation({ onSuccess: callerOnSuccess }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mutateAsync({ feed_id: FEED_ID, body: "hi" });
    });

    expect(ids()).toEqual(["comment_2", "comment_1"]);
    expect(callerOnSuccess).toHaveBeenCalledTimes(1);
  });

  it("delete: a caller onError does not replace the optimistic rollback", async () => {
    deleteComment.mockRejectedValue(new Error("boom"));
    const callerOnError = vi.fn();
    const { wrapper, ids } = setup();
    const { result } = renderHook(() => useDeleteCommentMutation({ onError: callerOnError }), {
      wrapper,
    });

    await act(async () => {
      await result.current
        .mutateAsync({ feedId: FEED_ID, commentId: "comment_1" })
        .catch(() => undefined);
    });

    expect(ids()).toEqual(["comment_1"]);
    expect(callerOnError).toHaveBeenCalledTimes(1);
  });
});
