/**
 * F-516: useMarkPushedReadMutation sends exactly the push's ids to
 * mark-read (never a "mark all" call), and refreshes the bell list and
 * the badge afterwards, whether the server accepted it or not.
 */
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
  getSession: async () => null,
}));

const markNotificationsRead = vi.fn();
const markNotificationsReadByIds = vi.fn();
vi.mock("@/lib/api/notifications-endpoints", () => ({
  getNotifications: vi.fn(),
  markNotificationsRead: (...a: unknown[]) => markNotificationsRead(...a),
  markNotificationsReadByIds: (...a: unknown[]) => markNotificationsReadByIds(...a),
}));

import { BADGES_QUERY_KEY_ROOT } from "@/hooks/useBadges";
import { NOTIFICATIONS_QUERY_KEY, useMarkPushedReadMutation } from "@/hooks/useNotifications";

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, "invalidateQueries");
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const invalidatedKeys = () =>
    invalidate.mock.calls.map(([filters]) => JSON.stringify(filters?.queryKey));
  return { wrapper, invalidatedKeys };
}

beforeEach(() => {
  markNotificationsRead.mockReset();
  markNotificationsReadByIds.mockReset();
});

describe("useMarkPushedReadMutation", () => {
  it("marks exactly the push's ids, then refreshes the list and the badge", async () => {
    markNotificationsReadByIds.mockResolvedValue({ ok: true, updated: 2 });
    const { wrapper, invalidatedKeys } = setup();
    const { result } = renderHook(() => useMarkPushedReadMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync([21, 22]);
    });

    expect(markNotificationsReadByIds).toHaveBeenCalledWith([21, 22]);
    expect(markNotificationsRead).not.toHaveBeenCalled();
    expect(invalidatedKeys()).toEqual(
      expect.arrayContaining([JSON.stringify(NOTIFICATIONS_QUERY_KEY), JSON.stringify(BADGES_QUERY_KEY_ROOT)])
    );
  });

  it("still refreshes when the server refuses", async () => {
    markNotificationsReadByIds.mockRejectedValue(new Error("boom"));
    const { wrapper, invalidatedKeys } = setup();
    const { result } = renderHook(() => useMarkPushedReadMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync([21]).catch(() => undefined);
    });

    expect(invalidatedKeys()).toEqual(
      expect.arrayContaining([JSON.stringify(NOTIFICATIONS_QUERY_KEY), JSON.stringify(BADGES_QUERY_KEY_ROOT)])
    );
  });
});
