import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

/**
 * Wallet link/unlink and recovery-email verify refresh "the user
 * view-model" so wallet badges update. They invalidated ["users"], but
 * useUser keys on ["user", handle], so the profile/author card kept the
 * stale badges until its staleTime ran out. These pin that the useUser
 * entry is actually marked invalid.
 */

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
  getSession: async () => null,
}));

const unlinkWallet = vi.fn();
const linkWallet = vi.fn();
const verifyRecoveryEmail = vi.fn();
const runLinkFlow = vi.fn();
vi.mock("@/lib/api/wallets-endpoints", () => ({
  getMyWallets: vi.fn(),
  unlinkWallet: (...a: unknown[]) => unlinkWallet(...a),
}));
vi.mock("@/lib/api/auth-endpoints", () => ({
  linkWallet: (...a: unknown[]) => linkWallet(...a),
}));
vi.mock("@/lib/api/account-endpoints", () => ({
  requestRecoveryEmail: vi.fn(),
  verifyRecoveryEmail: (...a: unknown[]) => verifyRecoveryEmail(...a),
}));
vi.mock("@/lib/wallet/linkFlow", () => ({
  runLinkFlow: (...a: unknown[]) => runLinkFlow(...a),
}));

import { useLinkWalletMutation, useUnlinkWallet } from "@/hooks/useWallets";
import { useVerifyRecoveryEmail } from "@/hooks/useRecoveryEmail";

const USER_KEY = ["user", "anvil"];

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  qc.setQueryData(USER_KEY, { handle: "anvil" });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  const userInvalidated = () => qc.getQueryState(USER_KEY)?.isInvalidated ?? false;
  return { qc, wrapper, userInvalidated };
}

describe("wallet mutations refresh the useUser cache", () => {
  it("useUnlinkWallet invalidates ['user', handle]", async () => {
    unlinkWallet.mockResolvedValue({ ok: true });
    const { wrapper, userInvalidated } = setup();
    const { result } = renderHook(() => useUnlinkWallet(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(5);
    });

    expect(userInvalidated()).toBe(true);
  });

  it("useLinkWalletMutation invalidates ['user', handle]", async () => {
    runLinkFlow.mockResolvedValue({ address: "0xabc", signature: "sig", walletType: "evm", extra: {} });
    linkWallet.mockResolvedValue({ chain_slug: "ethereum", chain_name: "Ethereum" });
    const { wrapper, userInvalidated } = setup();
    const { result } = renderHook(() => useLinkWalletMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ chainSlug: "ethereum", chainType: "evm" });
    });

    expect(userInvalidated()).toBe(true);
  });

  it("useVerifyRecoveryEmail invalidates ['user', handle]", async () => {
    verifyRecoveryEmail.mockResolvedValue({ ok: true });
    const { wrapper, userInvalidated } = setup();
    const { result } = renderHook(() => useVerifyRecoveryEmail(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync("123456");
    });

    expect(userInvalidated()).toBe(true);
  });

  it("WalletsSection's inline link flow invalidates the ['user'] prefix", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/settings/WalletsSection.tsx"),
      "utf-8",
    );
    expect(source).toContain('invalidateQueries({ queryKey: ["user"] })');
  });
});
