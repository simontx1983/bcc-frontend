/**
 * bcc-trust #398: "is this wallet yours?" after email verification, and
 * storing the replacement bearer a wallet unlink returns.
 *
 *  - verify-email shows the prompt ONLY when linked_wallet_count > 0
 *    (0 can mean the server's read failed; absent = older backend);
 *  - the prompt lists the owner's wallets, removes one only after a
 *    confirm, keeps failures in the dialog, and never blocks onboarding;
 *  - every unlink (Settings too, same hook) stores the returned token
 *    via updateSessionBearer BEFORE the wallet/user queries refetch,
 *    and only on a true removal.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError, type LinkedWallet } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const api = vi.hoisted(() => ({
  getMyWallets: vi.fn(),
  unlinkWallet: vi.fn(),
  verifyEmail: vi.fn(),
  updateSessionBearer: vi.fn(),
  signIn: vi.fn(),
  replace: vi.fn(),
  order: [] as string[],
}));

vi.mock("@/lib/api/wallets-endpoints", () => ({
  getMyWallets: () => api.getMyWallets(),
  unlinkWallet: (id: number) => api.unlinkWallet(id),
}));
vi.mock("@/lib/auth/session-update", () => ({
  updateSessionBearer: (u: unknown) => {
    api.order.push("store");
    return api.updateSessionBearer(u);
  },
}));
vi.mock("@/lib/api/auth-endpoints", () => ({
  verifyEmail: (b: unknown) => api.verifyEmail(b),
  resendVerification: vi.fn(),
  linkWallet: vi.fn(),
}));
vi.mock("next-auth/react", () => ({ signIn: (...a: unknown[]) => api.signIn(...a) }));
const searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: api.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => searchParams,
}));

const { WalletOwnershipPrompt } = await import("@/components/auth/WalletOwnershipPrompt");
const { useUnlinkWallet } = await import("@/hooks/useWallets");
const VerifyEmailPage = (await import("@/app/(auth)/verify-email/page")).default;

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  api.order.length = 0;
  api.updateSessionBearer.mockResolvedValue(true);
  searchParams.forEach((_, k) => searchParams.delete(k));
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
});
afterEach(() => {
  cleanup();
  client.clear();
});

const wrap = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

const wallet = (id: number, chain: string): LinkedWallet => ({
  id,
  wallet_address: `0x${String(id).padStart(40, "a")}`,
  chain_slug: chain.toLowerCase(),
  chain_name: chain,
  chain_type: "evm",
  explorer_url: "",
  wallet_type: "user",
  label: "",
  is_primary: false,
  verified: true,
  created_at: null,
});
const walletsResponse = (items: LinkedWallet[]) => ({
  items,
  recovery: { has_recovery_email: true, verified_wallet_count: items.length },
});

// ─────────────────────────────────────────────────────────────────────

describe("useUnlinkWallet — stores the replacement bearer", () => {
  it("a true removal stores the token BEFORE the wallet/user queries are invalidated", async () => {
    api.unlinkWallet.mockResolvedValue({
      ok: true, id: 5, removed: true, token: "fresh", expires_in: 604800, token_type: "Bearer",
    });
    const invalidate = vi.spyOn(client, "invalidateQueries").mockImplementation(async () => {
      api.order.push("invalidate");
    });
    const { result } = renderHook(() => useUnlinkWallet(), { wrapper: wrap });

    await act(async () => {
      await result.current.mutateAsync(5);
    });
    expect(api.updateSessionBearer).toHaveBeenCalledWith({ token: "fresh", expiresIn: 604800 });
    expect(api.order[0]).toBe("store");
    expect(api.order.slice(1).every((o) => o === "invalidate")).toBe(true);
    expect(invalidate).toHaveBeenCalled();
  });

  it.each([
    ["removed:false (foreign or gone id)", { ok: true, id: 5, removed: false }],
    ["an older backend with no token", { ok: true, id: 5, removed: true }],
  ])("stores nothing for %s, and reports sessionRestored: null", async (_l, resp) => {
    api.unlinkWallet.mockResolvedValue(resp);
    const { result } = renderHook(() => useUnlinkWallet(), { wrapper: wrap });
    let outcome: { sessionRestored: boolean | null } | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync(5);
    });
    expect(api.updateSessionBearer).not.toHaveBeenCalled();
    expect(outcome?.sessionRestored).toBeNull();
  });

  it("reports sessionRestored: false when the session write fails", async () => {
    api.unlinkWallet.mockResolvedValue({ ok: true, id: 5, removed: true, token: "t", expires_in: 60, token_type: "Bearer" });
    api.updateSessionBearer.mockResolvedValue(false);
    const { result } = renderHook(() => useUnlinkWallet(), { wrapper: wrap });
    let outcome: { sessionRestored: boolean | null } | undefined;
    await act(async () => {
      outcome = await result.current.mutateAsync(5);
    });
    expect(outcome?.sessionRestored).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────

describe("WalletOwnershipPrompt", () => {
  function renderPrompt() {
    const onDone = vi.fn();
    render(<WalletOwnershipPrompt onDone={onDone} />, { wrapper: wrap });
    return onDone;
  }

  it("asks about the linked wallet and removes it only after a confirm", async () => {
    api.getMyWallets.mockResolvedValueOnce(walletsResponse([wallet(5, "Ethereum")]));
    api.getMyWallets.mockResolvedValue(walletsResponse([]));
    api.unlinkWallet.mockResolvedValue({ ok: true, id: 5, removed: true, token: "t", expires_in: 60, token_type: "Bearer" });
    renderPrompt();

    expect(await screen.findByText("Is this wallet yours?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Not mine: remove the Ethereum wallet/ }));
    expect(api.unlinkWallet).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog", { name: "Remove this wallet?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove wallet" }));
    await waitFor(() => expect(api.unlinkWallet).toHaveBeenCalledWith(5));
    expect(await screen.findByText("No wallets are linked to this account now.")).toBeInTheDocument();
  });

  it("a removal whose session write fails says so, with a Sign in again button", async () => {
    api.getMyWallets.mockResolvedValueOnce(walletsResponse([wallet(5, "Ethereum")]));
    api.getMyWallets.mockResolvedValue(walletsResponse([]));
    api.unlinkWallet.mockResolvedValue({ ok: true, id: 5, removed: true, token: "t", expires_in: 60, token_type: "Bearer" });
    api.updateSessionBearer.mockResolvedValue(false);
    renderPrompt();

    fireEvent.click(await screen.findByRole("button", { name: /Not mine/ }));
    const dialog = screen.getByRole("dialog", { name: "Remove this wallet?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove wallet" }));
    expect(await screen.findByText(/couldn't refresh this device's sign-in/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sign in again" })).toBeInTheDocument();
  });

  it("'It's mine. Continue' continues without removing anything", async () => {
    api.getMyWallets.mockResolvedValue(walletsResponse([wallet(5, "Ethereum")]));
    const onDone = renderPrompt();
    fireEvent.click(await screen.findByRole("button", { name: "It's mine. Continue" }));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(api.unlinkWallet).not.toHaveBeenCalled();
  });

  it("a failed removal stays in the dialog with code-keyed copy", async () => {
    api.getMyWallets.mockResolvedValue(walletsResponse([wallet(5, "Ethereum")]));
    api.unlinkWallet.mockRejectedValue(new BccApiError("bcc_rate_limited", "RAW", 429, null));
    renderPrompt();

    fireEvent.click(await screen.findByRole("button", { name: /Not mine/ }));
    const dialog = screen.getByRole("dialog", { name: "Remove this wallet?" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove wallet" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Too many requests. Wait a moment and retry.");
    expect(screen.queryByText("RAW")).toBeNull();
  });

  it("a failed wallet load never blocks: it points to Settings and continues", async () => {
    api.getMyWallets.mockRejectedValue(new BccApiError("bcc_unavailable", "x", 503, null));
    const onDone = renderPrompt();
    expect(await screen.findByText(/review them any time in Settings → Wallets/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(onDone).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────

describe("verify-email — when to ask", () => {
  function verifyWith(linked: number | undefined) {
    searchParams.set("email", "me@example.com");
    searchParams.set("token", "link-token");
    api.verifyEmail.mockResolvedValue({
      user_id: 1, handle: "me", token: "jwt", expires_in: 604800, token_type: "Bearer",
      in_good_standing: true,
      ...(linked === undefined ? {} : { linked_wallet_count: linked }),
    });
    api.signIn.mockResolvedValue({ ok: true });
    api.getMyWallets.mockResolvedValue(walletsResponse([wallet(5, "Ethereum")]));
    render(<VerifyEmailPage />, { wrapper: wrap });
  }

  it("a positive count shows the prompt instead of going to onboarding", async () => {
    verifyWith(1);
    expect(await screen.findByText("Is this wallet yours?")).toBeInTheDocument();
    expect(api.replace).not.toHaveBeenCalled();
  });

  it.each([
    ["0 (which can mean the read failed)", 0],
    ["absent (older backend)", undefined],
  ])("count %s goes straight to onboarding, no prompt", async (_l, linked) => {
    verifyWith(linked);
    await waitFor(() => expect(api.replace).toHaveBeenCalledWith("/onboarding"));
    expect(screen.queryByText("Is this wallet yours?")).toBeNull();
    expect(api.getMyWallets).not.toHaveBeenCalled();
  });
});
