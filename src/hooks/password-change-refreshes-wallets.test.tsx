/**
 * F-253 review (MEDIUM): setting or changing a password refreshes
 * GET /wallets, whose `recovery.has_password` picks how the email / delete
 * forms confirm. A wallet-only member who sets a FIRST password must not be
 * left on the wallet path (stale `has_password: false`), which the server
 * refuses with a misleading 403.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const restored = vi.hoisted(() => ({ value: true }));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("@/lib/api/account-endpoints", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  patchAccountPassword: async () => ({ ok: true, token: "t", expires_in: 3600, token_type: "Bearer" }),
}));
vi.mock("@/lib/auth/session-update", () => ({ updateSessionBearer: async () => restored.value }));
vi.mock("@/lib/push/re-register", () => ({ reRegisterCurrentPushSubscription: async () => true }));

const { useChangeAccountPassword } = await import("@/hooks/useAccount");
const { MY_WALLETS_QUERY_KEY } = await import("@/hooks/useWallets");

let qc: QueryClient;
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  qc = new QueryClient();
  restored.value = true;
});

describe("useChangeAccountPassword", () => {
  it("re-reads the wallets (has_password) once the new session is in place", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useChangeAccountPassword(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ current_password: "old", password: "newpassword1" });
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: MY_WALLETS_QUERY_KEY });
  });

  it("does not, when the session could not be kept (the bearer is dead)", async () => {
    restored.value = false;
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useChangeAccountPassword(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ current_password: "old", password: "newpassword1" });
    });
    expect(invalidate).not.toHaveBeenCalledWith({ queryKey: MY_WALLETS_QUERY_KEY });
  });
});
