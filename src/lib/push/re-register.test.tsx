/**
 * bcc-trust #466: a password change deletes EVERY server-side push
 * subscription, this device's included. After the new bearer is in the
 * session, the password flow re-POSTs this device's existing subscription.
 * Best-effort: never prompts, never throws, never changes the outcome.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

const api = vi.hoisted(() => ({
  getCurrentBrowserSubscription: vi.fn(),
  registerPushSubscription: vi.fn(),
  patchAccountPassword: vi.fn(),
  updateSessionBearer: vi.fn(),
}));

vi.mock("@/lib/push/register", () => ({
  getCurrentBrowserSubscription: () => api.getCurrentBrowserSubscription(),
  subscriptionToPayload: (sub: { endpoint: string }, ua?: string) => ({
    endpoint: sub.endpoint,
    keys: { p256dh: "p", auth: "a" },
    ...(ua ? { user_agent: ua } : {}),
  }),
}));
vi.mock("@/lib/api/push-endpoints", () => ({
  registerPushSubscription: (p: unknown) => api.registerPushSubscription(p),
}));
vi.mock("@/lib/api/account-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  patchAccountPassword: (b: unknown) => api.patchAccountPassword(b),
}));
vi.mock("@/lib/auth/session-update", () => ({
  updateSessionBearer: (u: unknown) => api.updateSessionBearer(u),
}));

const { reRegisterCurrentPushSubscription } = await import("@/lib/push/re-register");
const { useChangeAccountPassword } = await import("@/hooks/useAccount");

const SUB = { endpoint: "https://push.example/abc" };
const requestPermission = vi.fn();

function setPermission(p: NotificationPermission | null) {
  if (p === null) {
    vi.stubGlobal("Notification", undefined);
  } else {
    vi.stubGlobal("Notification", { permission: p, requestPermission });
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  api.getCurrentBrowserSubscription.mockResolvedValue(SUB);
  api.registerPushSubscription.mockResolvedValue({ id: 1, master_enabled: true });
  setPermission("granted");
});
afterEach(() => vi.unstubAllGlobals());

describe("reRegisterCurrentPushSubscription", () => {
  it("re-POSTs this device's existing subscription when permission is already granted", async () => {
    await expect(reRegisterCurrentPushSubscription()).resolves.toBe(true);
    expect(api.registerPushSubscription).toHaveBeenCalledTimes(1);
    expect(api.registerPushSubscription.mock.calls[0]?.[0]).toMatchObject({ endpoint: SUB.endpoint });
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it.each([
    ["permission is default (never asked)", "default" as const],
    ["permission is denied", "denied" as const],
  ])("does nothing and never prompts when %s", async (_l, p) => {
    setPermission(p);
    await expect(reRegisterCurrentPushSubscription()).resolves.toBe(false);
    expect(api.getCurrentBrowserSubscription).not.toHaveBeenCalled();
    expect(api.registerPushSubscription).not.toHaveBeenCalled();
    expect(requestPermission).not.toHaveBeenCalled();
  });

  it("does nothing when the browser has no subscription", async () => {
    api.getCurrentBrowserSubscription.mockResolvedValue(null);
    await expect(reRegisterCurrentPushSubscription()).resolves.toBe(false);
    expect(api.registerPushSubscription).not.toHaveBeenCalled();
  });

  it("does nothing when Notification is unsupported", async () => {
    setPermission(null);
    await expect(reRegisterCurrentPushSubscription()).resolves.toBe(false);
  });

  it("never throws when the re-POST fails", async () => {
    api.registerPushSubscription.mockRejectedValue(new Error("boom"));
    await expect(reRegisterCurrentPushSubscription()).resolves.toBe(false);
  });
});

describe("useChangeAccountPassword re-registers push after the bearer swap", () => {
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}>
      {children}
    </QueryClientProvider>
  );
  const BODY = { current_password: "old-pass-1", password: "new-pass-12" } as never;

  beforeEach(() => {
    api.patchAccountPassword.mockResolvedValue({ ok: true, token: "fresh", expires_in: 3600, token_type: "Bearer" });
  });

  it("re-POSTs after a restored session, and the outcome is unchanged", async () => {
    api.updateSessionBearer.mockResolvedValue(true);
    const { result } = renderHook(() => useChangeAccountPassword(), { wrapper: wrap });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync(BODY);
    });
    expect(outcome).toEqual({ passwordChanged: true, sessionRestored: true });
    await vi.waitFor(() => expect(api.registerPushSubscription).toHaveBeenCalledTimes(1));
  });

  it("does not re-POST when the session write failed (the bearer is revoked)", async () => {
    api.updateSessionBearer.mockResolvedValue(false);
    const { result } = renderHook(() => useChangeAccountPassword(), { wrapper: wrap });
    await act(async () => {
      await result.current.mutateAsync(BODY);
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(api.registerPushSubscription).not.toHaveBeenCalled();
  });

  it("a failing re-POST never turns the change into a failure", async () => {
    api.updateSessionBearer.mockResolvedValue(true);
    api.registerPushSubscription.mockRejectedValue(new Error("push down"));
    const { result } = renderHook(() => useChangeAccountPassword(), { wrapper: wrap });
    let outcome: unknown;
    await act(async () => {
      outcome = await result.current.mutateAsync(BODY);
    });
    expect(outcome).toEqual({ passwordChanged: true, sessionRestored: true });
  });
});
