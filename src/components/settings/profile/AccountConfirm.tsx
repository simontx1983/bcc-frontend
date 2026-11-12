"use client";

/**
 * AccountConfirm — how the email / password / delete forms ask the member
 * to prove it's them (F-253, contract v1.130).
 *
 * `recovery.has_password` (GET /wallets) picks the confirmation:
 *   - `true` or `null` (or unknown): the current-password field, as before.
 *     An account that may have a password can never confirm with a wallet
 *     (the server refuses it: a stolen session can link its own wallet).
 *   - `false` (a wallet or OAuth signup that never set a password): a
 *     signature from one of the member's verified wallets, made at submit
 *     time over a challenge bound to this change (lib/wallet/confirmFlow).
 *   - `false` with no verified wallet: nothing can confirm here, so point
 *     at forgot-password, which sets a real password (D2).
 */

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

import { useMyWallets } from "@/hooks/useWallets";
import type { AccountCredential } from "@/lib/api/account-endpoints";
import { BccApiError, type LinkedWallet } from "@/lib/api/types";
import { formatAbsoluteDateTime } from "@/lib/format";
import {
  signAccountConfirmation,
  UnsupportedConfirmWalletError,
  WrongWalletError,
  type ConfirmPurpose,
} from "@/lib/wallet/confirmFlow";
import { humanizeWalletProviderError } from "@/lib/wallet/dispatch";

export type ConfirmMode = "password" | "wallet" | "no-wallet";

export function useAccountConfirm(purpose: ConfirmPurpose) {
  const wallets = useMyWallets();
  const verified = (wallets.data?.items ?? []).filter((w) => w.verified && w.wallet_type === "user");
  const hasPassword = wallets.data?.recovery.has_password;

  // Unknown — still loading, a failed read, or an older backend — means the
  // password field, exactly as the contract treats `has_password: null`.
  // Only a definite `false` switches to the wallet path. The server
  // enforces the rule either way and answers 422 naming the credential it
  // wants.
  const mode: ConfirmMode =
    hasPassword === false ? (verified.length > 0 ? "wallet" : "no-wallet") : "password";

  const [password, setPassword] = useState("");
  const [walletId, setWalletId] = useState<number | null>(null);
  const [signing, setSigning] = useState(false);
  const selected: LinkedWallet | null =
    verified.find((w) => w.id === walletId) ?? verified[0] ?? null;

  const ready = mode === "password" ? password !== "" : mode === "wallet" ? selected !== null : false;

  /** Build the credential for one submit. In wallet mode this asks the wallet to sign. */
  async function credential(): Promise<AccountCredential> {
    if (mode === "password") return { current_password: password };
    if (mode !== "wallet" || selected === null) throw new Error("no_credential");
    setSigning(true);
    try {
      return await signAccountConfirmation(purpose, selected);
    } finally {
      setSigning(false);
    }
  }

  return {
    mode,
    password,
    setPassword,
    wallets: verified,
    selected,
    selectWallet: setWalletId,
    signing,
    ready,
    credential,
    /** Forget the typed password (on success / cancel). */
    clear: () => setPassword(""),
  };
}

export type AccountConfirm = ReturnType<typeof useAccountConfirm>;

const shortAddress = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

/**
 * Wallet-path errors, by code (§γ — never the server message). Returns
 * null for anything not specific to the wallet path, so the form's own
 * humanizer handles it.
 */
export function humanizeConfirmError(err: unknown, mode: ConfirmMode): string | null {
  if (err instanceof WrongWalletError) {
    return `Your wallet is on a different account. Switch it to ${shortAddress(err.expected)} and try again.`;
  }
  if (err instanceof UnsupportedConfirmWalletError) {
    return "This wallet can't be used to confirm here. Pick another one.";
  }
  const provider = humanizeWalletProviderError(err);
  if (provider !== null) return provider;
  if (mode !== "wallet" || !(err instanceof BccApiError)) return null;

  if (err.code === "bcc_forbidden") {
    const data = err.data;
    const at =
      data !== null && typeof data === "object" && !Array.isArray(data)
        ? (data as Record<string, unknown>)["usable_at"]
        : undefined;
    if (typeof at === "string" && at !== "") {
      return `This wallet was verified recently. You can use it to confirm from ${formatAbsoluteDateTime(at)}.`;
    }
    return "This wallet was verified after you signed in. Sign out, sign back in, and try again.";
  }
  if (err.code === "bcc_signature_invalid") return "The wallet signature didn't check out. Try again.";
  if (err.code === "bcc_invalid_request" && err.status === 400) {
    return "That confirmation expired or didn't match. Try again to sign a new one.";
  }
  if (err.code === "bcc_unavailable") return "Confirming with a wallet isn't available right now. Try again later.";
  return null;
}

export function AccountConfirmField({
  confirm,
  disabled,
  describedBy,
  inputClassName,
}: {
  confirm: AccountConfirm;
  disabled: boolean;
  describedBy?: string | undefined;
  inputClassName: string;
}) {
  if (confirm.mode === "password") {
    return (
      <label className="flex flex-col gap-1">
        <span className="bcc-mono text-[10px] tracking-[0.16em] text-bcc-text-secondary">CURRENT PASSWORD</span>
        <input
          type="password"
          value={confirm.password}
          onChange={(e) => confirm.setPassword(e.target.value)}
          disabled={disabled}
          aria-describedby={describedBy}
          autoComplete="current-password"
          required
          className={inputClassName}
        />
      </label>
    );
  }

  if (confirm.mode === "no-wallet") {
    return (
      <p role="note" className="bcc-mono text-[11px] text-bcc-text-secondary">
        Your account has no password and no verified wallet to confirm with.{" "}
        <Link href={"/forgot-password" as Route} className="text-bcc-text underline">
          Set a password
        </Link>{" "}
        first, then come back.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {confirm.wallets.length > 1 ? (
        <label className="flex flex-col gap-1">
          <span className="bcc-mono text-[10px] tracking-[0.16em] text-bcc-text-secondary">CONFIRM WITH</span>
          <select
            value={confirm.selected?.id ?? ""}
            onChange={(e) => confirm.selectWallet(Number(e.target.value))}
            disabled={disabled}
            aria-describedby={describedBy}
            className={inputClassName}
          >
            {confirm.wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {`${w.chain_name} · ${shortAddress(w.wallet_address)}`}
              </option>
            ))}
          </select>
        </label>
      ) : (
        <p className="bcc-mono text-[11px] text-bcc-text">
          {`Confirm with ${confirm.selected?.chain_name ?? "your wallet"} · ${shortAddress(confirm.selected?.wallet_address ?? "")}`}
        </p>
      )}
      <p className="bcc-mono text-[10px] text-bcc-text-secondary">
        Your account has no password, so you confirm with a signature from your wallet. It will ask you to sign
        when you continue.
      </p>
    </div>
  );
}
