/**
 * F-294 — a wrong recovery-email code is being unified to `bcc_invalid_otp`.
 *    Today that confirm answers `bcc_invalid_request`, which this surface
 *    rendered as "Couldn't use that email…" — the wrong problem. The form
 *    must say "the code didn't work" for BOTH codes, so the backend switch
 *    can ship after this with no window of wrong copy.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/wallet/linkFlow", () => ({
  runLinkFlow: vi.fn(),
  humanizeLinkError: () => "Wallet unavailable.",
}));
vi.mock("@/components/onchain/CollectionStancePanel", () => ({
  CollectionStancePanel: () => null,
}));

const WALLETS = {
  items: [
    {
      id: 11,
      chain_slug: "base",
      chain_name: "Base",
      wallet_address: "0x1234567890abcdef1234567890abcdef12345678",
      verified: true,
      is_primary: true,
      created_at: "2026-08-01 10:00:00",
      explorer_url: "",
    },
  ],
  recovery: { has_recovery_email: false, has_password: true, verified_wallet_count: 1 },
};

vi.mock("@/hooks/useWallets", () => ({
  MY_WALLETS_QUERY_KEY: ["bcc", "me", "wallets"],
  useMyWallets: () => ({ data: WALLETS, isLoading: false, isError: false, refetch: vi.fn() }),
  useUnlinkWallet: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

// The recovery hooks hand back their callbacks so a test can play the
// server's answer: Send code succeeds, Confirm fails with `verifyError`.
const recovery = vi.hoisted(() => ({ verifyError: null as unknown }));
vi.mock("@/hooks/useRecoveryEmail", () => ({
  useRequestRecoveryEmail: (o: { onSuccess?: (d: { email_masked: string }) => void }) => ({
    mutate: () => o.onSuccess?.({ email_masked: "m***@example.com" }),
    isPending: false,
    reset: vi.fn(),
  }),
  useVerifyRecoveryEmail: (o: { onError?: (e: unknown) => void }) => ({
    mutate: () => o.onError?.(recovery.verifyError),
    isPending: false,
    reset: vi.fn(),
  }),
}));

const { WalletsSection } = await import("@/components/settings/WalletsSection");
const { BccApiError } = await import("@/lib/api/types");

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  vi.clearAllMocks();
  recovery.verifyError = null;
});

afterEach(() => cleanup());

function withClient(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

// ─────────────────────────────────────────────────────────────────────
// Recovery-email confirm: both wrong-code codes
// ─────────────────────────────────────────────────────────────────────

const WRONG_CODE = "That code didn't match or has expired. Check the latest email, or start over for a new code.";

function confirmWith(err: unknown) {
  recovery.verifyError = err;
  withClient(<WalletsSection />);
  fireEvent.click(screen.getByRole("button", { name: "Add recovery email" }));
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: "me@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send code" }));
  fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
  return screen.getByRole("alert");
}

describe("recovery-email confirm — wrong code", () => {
  it.each([
    ["bcc_invalid_otp (the unified code)", "bcc_invalid_otp"],
    ["bcc_invalid_request (today's code)", "bcc_invalid_request"],
  ])("%s says the code didn't work, not that the email is unusable", (_label, code) => {
    const alert = confirmWith(new BccApiError(code, "raw server prose", 422, null));
    expect(alert).toHaveTextContent(WRONG_CODE);
    expect(alert).not.toHaveTextContent(/Couldn't use that email/);
    expect(screen.queryByText(/raw server prose/)).toBeNull();
    // The code form stays open for another try.
    expect(screen.getByRole("button", { name: "Start over" })).toBeEnabled();
  });

  it("five wrong codes points at a new code", () => {
    const alert = confirmWith(new BccApiError("bcc_otp_exhausted", "x", 429, null));
    expect(alert).toHaveTextContent("Too many attempts. Start over to get a new code.");
  });
});
