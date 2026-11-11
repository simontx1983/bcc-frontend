import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * useMarkReadMutation flips rows to read optimistically. It had no
 * onError, so a refused mark-read left the rows looking read until the
 * next list fetch, and no cancelQueries, so an in-flight list fetch could
 * land over the patch. Both are pinned here.
 */

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
  getSession: async () => null,
}));

const markNotificationsRead = vi.fn();
vi.mock("@/lib/api/notifications-endpoints", () => ({
  getNotifications: vi.fn(),
  markNotificationsRead: (...a: unknown[]) => markNotificationsRead(...a),
}));

import { NOTIFICATIONS_QUERY_KEY, useMarkReadMutation } from "@/hooks/useNotifications";
import type { NotificationItem, NotificationsListResponse } from "@/lib/api/types";

function makeItem(id: number): NotificationItem {
  return {
    id,
    type: "bcc_reaction",
    message: "Someone stoked your post",
    created_at: "2026-11-10T00:00:00Z",
    read: false,
    actor: { id: 9, handle: "anvil", display_name: "Anvil", avatar_url: "" },
    link: "/post/f1",
  };
}

function seed(): InfiniteData<NotificationsListResponse> {
  return {
    pages: [{ items: [makeItem(1), makeItem(2)], pagination: { has_more: false, next_cursor: null } }],
    pageParams: [null],
  };
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(NOTIFICATIONS_QUERY_KEY, seed());
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const readFlags = () =>
    qc
      .getQueryData<InfiniteData<NotificationsListResponse>>(NOTIFICATIONS_QUERY_KEY)
      ?.pages.flatMap((page) => page.items.map((item) => item.read));
  return { qc, wrapper, readFlags };
}

describe("useMarkReadMutation", () => {
  it("restores the unread rows when the server refuses the mark-read", async () => {
    markNotificationsRead.mockRejectedValue(new Error("boom"));
    const { wrapper, readFlags } = setup();
    const { result } = renderHook(() => useMarkReadMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(undefined).catch(() => undefined);
    });

    expect(readFlags()).toEqual([false, false]);
  });

  it("keeps the optimistic read state on success", async () => {
    markNotificationsRead.mockResolvedValue({ ok: true, updated: 1 });
    const { wrapper, readFlags } = setup();
    const { result } = renderHook(() => useMarkReadMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(readFlags()).toEqual([true, false]);
  });

  it("cancels in-flight list fetches before patching", async () => {
    markNotificationsRead.mockResolvedValue({ ok: true, updated: 1 });
    const { qc, wrapper } = setup();
    const cancel = vi.spyOn(qc, "cancelQueries");
    const { result } = renderHook(() => useMarkReadMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(1);
    });

    expect(cancel).toHaveBeenCalledWith({ queryKey: NOTIFICATIONS_QUERY_KEY });
  });
});
