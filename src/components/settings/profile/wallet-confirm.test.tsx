/**
 * F-253 (contract v1.130) — an account with NO password confirms an email
 * change, setting a password, or deleting the account with a wallet
 * signature; every other account keeps typing its password.
 *
 * `recovery.has_password` (GET /wallets) decides: `false` → wallet;
 * `true` / `null` / unknown → password. A wallet-only account with no
 * verified wallet is pointed at forgot-password. Errors render by code,
 * never the server's message.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";
import type * as ConfirmFlow from "@/lib/wallet/confirmFlow";

const DECOY = "SERVER MESSAGE THAT MUST NEVER RENDER";

const wallets = vi.hoisted(() => ({ data: undefined as unknown, isLoading: false }));
const sign = vi.hoisted(() => vi.fn());
const emailMutate = vi.hoisted(() => vi.fn());
const passwordMutate = vi.hoisted(() => vi.fn());
const deleteMutate = vi.hoisted(() => vi.fn());
const handlers = vi.hoisted(() => ({
  email: {} as { onError?: (e: unknown) => void },
  password: {} as { onError?: (e: unknown) => void },
  del: {} as { onError?: (e: unknown) => void },
}));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("next-auth/react", () => ({ signOut: vi.fn() }));
vi.mock("@/hooks/useDirtyRegistration", () => ({ useDirtyRegistration: () => {} }));
vi.mock("@/hooks/useWallets", () => ({ MY_WALLETS_QUERY_KEY: ["me", "wallets"], useMyWallets: () => wallets }));
vi.mock("@/lib/wallet/confirmFlow", async (orig) => ({
  ...(await orig<typeof ConfirmFlow>()),
  signAccountConfirmation: (...a: unknown[]) => sign(...a),
}));
const mutation = (mutate: unknown) => ({ mutate, isPending: false, reset: vi.fn() });
vi.mock("@/hooks/useAccount", () => ({
  useChangeAccountEmail: (o: { onError?: (e: unknown) => void }) => {
    handlers.email = o;
    return mutation(emailMutate);
  },
  useVerifyAccountEmailChange: () => mutation(vi.fn()),
  useChangeAccountPassword: (o: { onError?: (e: unknown) => void }) => {
    handlers.password = o;
    return mutation(passwordMutate);
  },
  useDeleteAccount: (o: { onError?: (e: unknown) => void }) => {
    handlers.del = o;
    return mutation(deleteMutate);
  },
}));

const { AccountSection } = await import("@/components/settings/profile/AccountSection");
const { DeleteAccountCard } = await import("@/components/settings/profile/DeleteAccountCard");
const { WrongWalletError } = await import("@/lib/wallet/confirmFlow");

const KEPLR = {
  id: 3,
  wallet_address: "cosmos1qypqxpq9qcrsszg2pvxq6rs0zqg3yyc5lzv7xu",
  chain_slug: "cosmos",
  chain_name: "Cosmos Hub",
  chain_type: "cosmos",
  wallet_type: "user",
  verified: true,
};
let qc: QueryClient;
const render = (ui: ReactElement) => rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);

const SIGNED = {
  wallet_address: KEPLR.wallet_address,
  chain_slug: "cosmos",
  signature: "sig",
  extra: { pub_key: "pk", chain_id: "cosmoshub-4" },
};

function walletsWith(hasPassword: boolean | null | undefined, items: unknown[] = [KEPLR]) {
  wallets.data = {
    items,
    recovery: {
      has_recovery_email: false,
      verified_wallet_count: items.length,
      ...(hasPassword !== undefined ? { has_password: hasPassword } : {}),
    },
  };
}

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => {
  sign.mockReset().mockResolvedValue(SIGNED);
  emailMutate.mockReset();
  passwordMutate.mockReset();
  deleteMutate.mockReset();
  wallets.isLoading = false;
  qc = new QueryClient();
});
afterEach(cleanup);

const emailField = () => screen.getByRole("textbox", { name: /^email$/i });

describe("which confirmation each account gets", () => {
  it.each([
    ["has_password true", true],
    ["has_password null (unknown)", null],
    ["field absent (older backend)", undefined],
  ])("%s → the current-password field, sent as current_password", (_l, hp) => {
    walletsWith(hp as boolean | null | undefined);
    render(<AccountSection currentEmail="a@x.io" />);
    expect(screen.getAllByLabelText(/current password/i)).toHaveLength(2);

    fireEvent.change(emailField(), { target: { value: "b@x.io" } });
    fireEvent.change(screen.getAllByLabelText(/current password/i)[0] as HTMLElement, { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(emailMutate).toHaveBeenCalledWith({ current_password: "pw", email: "b@x.io" });
    expect(sign).not.toHaveBeenCalled();
  });

  it("has_password false → no password field; the email change signs with the wallet", async () => {
    walletsWith(false);
    render(<AccountSection currentEmail="a@x.io" />);
    expect(screen.queryByLabelText(/current password/i)).toBeNull();
    expect(screen.getAllByText(/Confirm with Cosmos Hub/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Set a password" })).toBeInTheDocument();

    fireEvent.change(emailField(), { target: { value: "b@x.io" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    await waitFor(() => expect(emailMutate).toHaveBeenCalledWith({ ...SIGNED, email: "b@x.io" }));
    expect(sign).toHaveBeenCalledWith("confirm_email_change", expect.objectContaining({ id: 3 }));
    expect(emailMutate.mock.calls[0]?.[0]).not.toHaveProperty("current_password");
  });

  it("has_password false with no verified wallet → a forgot-password pointer, nothing to submit", () => {
    walletsWith(false, []);
    render(<AccountSection currentEmail="a@x.io" />);
    const links = screen.getAllByRole("link", { name: "Set a password" });
    expect(links[0]).toHaveAttribute("href", "/forgot-password");
    fireEvent.change(emailField(), { target: { value: "b@x.io" } });
    expect(screen.getByRole("button", { name: "Send code" })).toBeDisabled();
  });
});

describe("wallet-path errors, by code", () => {
  async function failEmail(err: unknown) {
    walletsWith(false);
    render(<AccountSection currentEmail="a@x.io" />);
    fireEvent.change(emailField(), { target: { value: "b@x.io" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    await waitFor(() => expect(emailMutate).toHaveBeenCalled());
    handlers.email.onError?.(err);
  }

  it("a wallet not yet established names the date", async () => {
    await failEmail(
      new BccApiError("bcc_forbidden", DECOY, 403, {
        error: { code: "bcc_forbidden", message: DECOY, data: { usable_at: "2026-11-14T12:00:00Z" } },
      } as never),
    );
    expect(await screen.findByText(/You can use it to confirm from/)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain(DECOY);
  });

  it("a 403 without usable_at covers both causes and re-reads has_password", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    await failEmail(new BccApiError("bcc_forbidden", DECOY, 403, null));
    expect(
      await screen.findByText(/just set a password, use it instead\. If you linked this wallet after signing in, sign out, sign back in/),
    ).toBeInTheDocument();
    // An account that now HAS a password switches to the password field.
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["me", "wallets"] });
  });

  it("a suspended account (#637) says so in wallet mode, with no re-read and no wallet copy", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    await failEmail(
      new BccApiError("bcc_forbidden", DECOY, 403, {
        error: { code: "bcc_forbidden", message: DECOY, data: { reason_code: "account_suspended" } },
      } as never),
    );
    expect(await screen.findByText(/Your account is suspended, so you can.t make this change/)).toBeInTheDocument();
    expect(screen.queryByText(/use it instead/)).toBeNull();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("a suspended account says so in password mode too", async () => {
    walletsWith(true);
    render(<AccountSection currentEmail="a@x.io" />);
    fireEvent.change(emailField(), { target: { value: "b@x.io" } });
    fireEvent.change(screen.getAllByLabelText(/current password/i)[0] as HTMLElement, { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    handlers.email.onError?.(
      new BccApiError("bcc_forbidden", DECOY, 403, {
        error: { code: "bcc_forbidden", message: DECOY, data: { reason_code: "account_suspended" } },
      } as never),
    );
    expect(await screen.findByText(/Your account is suspended, so you can.t make this change/)).toBeInTheDocument();
    expect(document.body.textContent ?? "").not.toContain(DECOY);
  });

  it("an expired challenge asks for a new signature", async () => {
    await failEmail(new BccApiError("bcc_invalid_request", DECOY, 400, null));
    expect(await screen.findByText(/Check the wallet is linked and verified/)).toBeInTheDocument();
  });

  it("the wrong wallet account in the extension is caught before any request", async () => {
    walletsWith(false);
    sign.mockRejectedValue(new WrongWalletError(KEPLR.wallet_address));
    render(<AccountSection currentEmail="a@x.io" />);
    fireEvent.change(emailField(), { target: { value: "b@x.io" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));
    expect(await screen.findByText(/Switch it to cosmos…v7xu/)).toBeInTheDocument();
    expect(emailMutate).not.toHaveBeenCalled();
  });
});

describe("set a password and delete, wallet path", () => {
  it("a wallet-only account sets its first password by signing (confirm_password_change)", async () => {
    walletsWith(false);
    render(<AccountSection currentEmail="a@x.io" />);
    fireEvent.change(screen.getByLabelText(/^new password$/i), { target: { value: "longenough1" } });
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: "longenough1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save password" }));
    await waitFor(() => expect(passwordMutate).toHaveBeenCalledWith({ ...SIGNED, password: "longenough1" }));
    expect(sign).toHaveBeenCalledWith("confirm_password_change", expect.anything());
  });

  it("deleting signs with confirm_account_delete", async () => {
    walletsWith(false);
    render(<DeleteAccountCard />);
    fireEvent.click(screen.getByRole("button", { name: /delete my account/i }));
    expect(screen.queryByLabelText(/current password/i)).toBeNull();
    fireEvent.change(screen.getByLabelText(/type delete to confirm/i), { target: { value: "DELETE" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete forever" }));
    await waitFor(() => expect(deleteMutate).toHaveBeenCalledWith({ ...SIGNED, confirm: "DELETE" }));
    expect(sign).toHaveBeenCalledWith("confirm_account_delete", expect.anything());
  });
});
