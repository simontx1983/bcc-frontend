/**
 * POST /me/account/recovery-email/verify will revoke earlier bearers and
 * return a replacement. useVerifyRecoveryEmail must store it via
 * updateSessionBearer BEFORE the wallet/user queries refetch, and must
 * keep working against an older backend that returns no token.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const api = vi.hoisted(() => ({
  verifyRecoveryEmail: vi.fn(),
  updateSessionBearer: vi.fn(),
  order: [] as string[],
}));

vi.mock("@/lib/api/account-endpoints", () => ({
  verifyRecoveryEmail: (b: unknown) => api.verifyRecoveryEmail(b),
  requestRecoveryEmail: vi.fn(),
}));
vi.mock("@/lib/auth/session-update", () => ({
  updateSessionBearer: (u: unknown) => {
    api.order.push("store");
    return api.updateSessionBearer(u);
  },
}));
vi.mock("@/lib/wallet/linkFlow", () => ({ runLinkFlow: vi.fn() }));

const { useVerifyRecoveryEmail } = await import("@/hooks/useRecoveryEmail");

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  api.order.length = 0;
  api.updateSessionBearer.mockResolvedValue(true);
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  vi.spyOn(client, "invalidateQueries").mockImplementation(async () => {
    api.order.push("invalidate");
  });
});

const wrap = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

describe("useVerifyRecoveryEmail — replacement bearer", () => {
  it("stores the returned token before any invalidation", async () => {
    api.verifyRecoveryEmail.mockResolvedValue({
      ok: true, email: "me@example.com", token: "fresh", expires_in: 604800, token_type: "Bearer",
    });
    const { result } = renderHook(() => useVerifyRecoveryEmail(), { wrapper: wrap });
    await act(async () => {
      await result.current.mutateAsync("123456");
    });
    expect(api.updateSessionBearer).toHaveBeenCalledWith({ token: "fresh", expiresIn: 604800 });
    expect(api.order[0]).toBe("store");
    expect(api.order).toContain("invalidate");
  });

  it("an older backend with no token stores nothing and still succeeds", async () => {
    api.verifyRecoveryEmail.mockResolvedValue({ ok: true, email: "me@example.com" });
    const { result } = renderHook(() => useVerifyRecoveryEmail(), { wrapper: wrap });
    await act(async () => {
      await result.current.mutateAsync("123456");
    });
    expect(api.updateSessionBearer).not.toHaveBeenCalled();
    expect(api.order).toContain("invalidate");
  });
});
