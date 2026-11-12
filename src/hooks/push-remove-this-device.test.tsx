/**
 * H5 — removeThisDevice stops push on THIS browser only.
 *
 * It must unsubscribe the browser and DELETE this device's own server row
 * (by the id parked at registration), and must NOT send the prefs PATCH
 * that turns the account's master off and removes every device.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PUSH_SUBSCRIPTION_ID_KEY } from "@/lib/push/revoke";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const browser = vi.hoisted(() => ({ subscribed: true }));
const unregisterBrowserPush = vi.hoisted(() => vi.fn());
vi.mock("@/lib/push/register", () => ({
  isPushSupported: () => true,
  getCurrentBrowserSubscription: async () => (browser.subscribed ? ({} as PushSubscription) : null),
  registerBrowserPush: vi.fn(),
  subscriptionToPayload: vi.fn(),
  unregisterBrowserPush: (...a: unknown[]) => unregisterBrowserPush(...a),
}));

const removeMyPushSubscription = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/push-endpoints", () => ({
  getVapidPublicKey: vi.fn(),
  registerPushSubscription: vi.fn(),
  deletePushSubscription: vi.fn(),
  removeMyPushSubscription: (...a: unknown[]) => removeMyPushSubscription(...a),
}));

const patchNotificationPrefs = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api/notification-prefs-endpoints", () => ({
  patchNotificationPrefs: (...a: unknown[]) => patchNotificationPrefs(...a),
}));

const { usePushSubscription } = await import("@/hooks/usePushSubscription");

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  browser.subscribed = true;
  unregisterBrowserPush.mockImplementation(async () => {
    browser.subscribed = false;
  });
  removeMyPushSubscription.mockResolvedValue({ ok: true });
  window.localStorage.setItem(PUSH_SUBSCRIPTION_ID_KEY, "17");
  qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
});
afterEach(() => {
  window.localStorage.clear();
  qc.clear();
});

describe("removeThisDevice", () => {
  it("unsubscribes the browser, deletes this device's row, and leaves the account alone", async () => {
    const { result } = renderHook(() => usePushSubscription(), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));
    expect(result.current.browserSubscribed).toBe(true);

    await act(async () => {
      await result.current.removeThisDevice.mutateAsync();
    });

    expect(unregisterBrowserPush).toHaveBeenCalledTimes(1);
    expect(removeMyPushSubscription).toHaveBeenCalledWith(17);
    expect(patchNotificationPrefs).not.toHaveBeenCalled();
    expect(window.localStorage.getItem(PUSH_SUBSCRIPTION_ID_KEY)).toBeNull();
    await waitFor(() => expect(result.current.browserSubscribed).toBe(false));
  });

  it("fails (and keeps the device marked subscribed) when the browser refuses to unsubscribe", async () => {
    unregisterBrowserPush.mockImplementation(async () => {
      /* browser kept the subscription */
    });
    const { result } = renderHook(() => usePushSubscription(), { wrapper });
    await waitFor(() => expect(result.current.isReady).toBe(true));

    await act(async () => {
      await result.current.removeThisDevice.mutateAsync().catch(() => undefined);
    });

    await waitFor(() => expect(result.current.removeThisDevice.isError).toBe(true));
    expect(result.current.browserSubscribed).toBe(true);
    expect(removeMyPushSubscription).not.toHaveBeenCalled();
    expect(patchNotificationPrefs).not.toHaveBeenCalled();
  });
});
