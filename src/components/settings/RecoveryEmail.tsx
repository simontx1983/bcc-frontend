"use client";

/**
 * Recovery email — the banner + two-step (wallet-signed request, then
 * 6-digit OTP) form that lets a wallet-only account attach a real
 * recovery address.
 *
 * Moved verbatim out of WalletsSection.tsx (F-332) so the onboarding
 * "Secure your account" step can render the SAME form instead of a second
 * copy of the wallet-signing flow. Behaviour is unchanged; WalletsSection
 * imports it back.
 */

import { useState } from "react";

import {
  RECOVERY_EMAIL_SESSION_LOST,
  SessionWriteFailedNotice,
} from "@/components/auth/SessionWriteFailedNotice";
import {
  useRequestRecoveryEmail,
  useVerifyRecoveryEmail,
} from "@/hooks/useRecoveryEmail";
import { humanizeCode } from "@/lib/api/errors";
import type { LinkedWallet } from "@/lib/api/types";
import { formatAbsoluteDateTime } from "@/lib/format";
import type { RecoveryAvailability } from "@/lib/onboarding/recovery-availability";
import { findWalletChain, type WalletChainType } from "@/lib/wallet/chain-catalog";
import { humanizeLinkError } from "@/lib/wallet/linkFlow";
import { walletInstallUrl } from "@/lib/wallet/dispatch";
import { OpenInWalletApp } from "@/components/wallet/OpenInWalletApp";

// ─────────────────────────────────────────────────────────────────────
// Recovery email — banner + inline two-step form.
//
// A wallet-only account (random unseen password + undeliverable
// @noreply.bcc.local placeholder) can attach a real recovery email,
// proven by a fresh signature from one of the user's already-verified
// wallets followed by a 6-digit OTP. Renders only when the server says
// has_recovery_email === false. Copy hardens when the account has a
// single verified wallet (that wallet is the only way back in).
//
// No business logic here: urgency + which-wallets-are-eligible derive
// from server fields (recovery.verified_wallet_count + item.verified).
//
// Whether the wallet-signed add path is open is the server's call too
// (recovery.available_at / available_reason, bcc-trust #658), read through
// recoveryAvailability() — the same reading the onboarding step and the
// profile nudge use. When it is not open, the panel says when or how
// instead of offering a form that would refuse. A form the member has
// already opened stays open: availability can change under them, and
// pulling the form away mid-entry loses what they typed.
// ─────────────────────────────────────────────────────────────────────

interface RecoveryEmailPanelProps {
  verifiedWalletCount: number;
  verifiedWallets: LinkedWallet[];
  onLinkAnotherWallet: () => void;
  /** recoveryAvailability(), evaluated by the caller at render time. */
  availability: RecoveryAvailability;
}

export function RecoveryEmailPanel({
  verifiedWalletCount,
  verifiedWallets,
  onLinkAnotherWallet,
  availability,
}: RecoveryEmailPanelProps) {
  const [formOpen, setFormOpen] = useState(false);

  const urgent = verifiedWalletCount <= 1;

  return (
    <div className="flex flex-col gap-3 border border-safety/50 bg-safety/5 p-4">
      <div className="flex flex-col gap-1">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-safety">
          ACCOUNT RECOVERY
        </span>
        <p className="font-serif text-sm text-bcc-text">
          {urgent
            ? "Your wallet is the only way into this account — add a recovery email so you can't get locked out."
            : "Add a recovery email so you can get back in if you lose your wallets."}
        </p>
      </div>

      {formOpen ? (
        <RecoveryEmailForm
          verifiedWallets={verifiedWallets}
          onClose={() => setFormOpen(false)}
        />
      ) : (
        <>
          {availability.kind === "later" && (
            <p className="font-serif text-sm text-bcc-text">
              You can add a recovery email from {formatAbsoluteDateTime(availability.at)}.
            </p>
          )}
          {availability.kind === "relogin" && (
            <p className="font-serif text-sm text-bcc-text">
              Adding a recovery email needs a recently signed-in wallet. Sign out and
              back in with your wallet, then add it here.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {availability.kind === "open" && (
              <button
                type="button"
                onClick={() => setFormOpen(true)}
                className="bcc-stencil border border-ink bg-cardstock px-4 py-2 text-ink transition hover:bg-ink hover:text-cardstock"
              >
                Add recovery email
              </button>
            )}
            <button
              type="button"
              onClick={onLinkAnotherWallet}
              className="bcc-mono text-[11px] tracking-[0.14em] text-blueprint hover:underline"
            >
              {availability.kind === "open" ? "or link another wallet" : "Link another wallet"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Eligible signing options for the recovery proof: one entry per
// verified wallet whose chain has a frontend signing flow (catalog hit).
// chain_type comes off the wallet row but we resolve the catalog's
// chainType so the dispatch tag is authoritative (server vs catalog
// strings agree today, but the catalog owns the signing-flow mapping).
export interface RecoveryChainOption {
  /** Stable key for the <option> — wallet id, so duplicate chains stay distinct. */
  key: string;
  slug: string;
  chainType: WalletChainType;
  label: string;
  address: string;
}

export function recoveryChainOptions(
  verifiedWallets: LinkedWallet[],
): RecoveryChainOption[] {
  const out: RecoveryChainOption[] = [];
  for (const w of verifiedWallets) {
    const catalog = findWalletChain(w.chain_slug);
    if (catalog === undefined) continue; // no signing flow for this chain
    out.push({
      key: String(w.id),
      slug: catalog.slug,
      chainType: catalog.chainType,
      label: w.chain_name || catalog.label,
      address: w.wallet_address,
    });
  }
  return out;
}

export function RecoveryEmailForm({
  verifiedWallets,
  onClose,
}: {
  verifiedWallets: LinkedWallet[];
  onClose: () => void;
}) {
  const options = recoveryChainOptions(verifiedWallets);

  const [email, setEmail] = useState("");
  const [walletKey, setWalletKey] = useState<string>(
    options[0]?.key ?? "",
  );
  // Step 2 state — set once the OTP has been sent.
  const [maskedEmail, setMaskedEmail] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const [sessionLost, setSessionLost] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useRequestRecoveryEmail({
    onSuccess: (data) => {
      setError(null);
      setMaskedEmail(data.email_masked);
    },
    onError: (err) => setError(humanizeRecoveryError(err)),
  });

  const verify = useVerifyRecoveryEmail({
    onSuccess: (data) => {
      setError(null);
      // The query invalidation in the hook clears the banner; show a
      // brief confirmation in case the unmount is delayed by a refetch.
      setDone(data.email);
      setSessionLost(data.sessionRestored === false);
    },
    onError: (err) => setError(humanizeRecoveryVerifyError(err)),
  });

  const selected = options.find((o) => o.key === walletKey);

  function sendCode() {
    setError(null);
    if (selected === undefined) {
      setError("Pick a verified wallet to sign with.");
      return;
    }
    if (email.trim() === "") {
      setError("Enter the email you want to use for recovery.");
      return;
    }
    request.mutate({
      chainSlug: selected.slug,
      chainType: selected.chainType,
      email: email.trim(),
    });
  }

  function confirmCode() {
    setError(null);
    if (code.trim().length !== 6) {
      setError("Enter the 6-digit code from the email.");
      return;
    }
    verify.mutate(code.trim());
  }

  function startOver() {
    setMaskedEmail(null);
    setCode("");
    setError(null);
    request.reset();
    verify.reset();
  }

  if (done !== null) {
    return (
      <div className="flex flex-col gap-2">
        <p
          className="bcc-mono text-[11px]"
          style={{ color: "var(--verified)" }}
        >
          Recovery email confirmed: {done}
        </p>
        {sessionLost && <SessionWriteFailedNotice message={RECOVERY_EMAIL_SESSION_LOST} />}
      </div>
    );
  }

  // ── Step 2: OTP confirmation ──
  if (maskedEmail !== null) {
    return (
      <div className="flex flex-col gap-3">
        <p className="font-serif text-[13px] text-bcc-text-secondary" aria-live="polite">
          We sent a 6-digit code to {maskedEmail}. Enter it below to confirm.
          The code expires shortly — use <em>start over</em> if it lapses.
        </p>

        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1.5">
            <span className="bcc-mono text-[11px] text-bcc-text-secondary">
              Verification code
            </span>
            <input
              value={code}
              onChange={(e) =>
                setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))
              }
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              disabled={verify.isPending}
              className="bcc-mono w-[8rem] border border-bcc-input-border bg-bcc-input-bg px-3 py-2 tracking-[0.3em] text-bcc-text outline-none focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent disabled:opacity-50"
            />
          </label>

          <button
            type="button"
            onClick={confirmCode}
            disabled={verify.isPending}
            className="bcc-stencil border border-ink bg-cardstock px-4 py-2 text-ink transition hover:bg-ink hover:text-cardstock disabled:opacity-50"
          >
            {verify.isPending ? "Confirming…" : "Confirm"}
          </button>

          <button
            type="button"
            onClick={startOver}
            disabled={verify.isPending}
            className="bcc-mono text-[11px] tracking-[0.14em] text-bcc-text-secondary hover:text-bcc-text disabled:opacity-50"
          >
            Start over
          </button>
        </div>

        {error !== null && (
          <p role="alert" className="bcc-mono text-[11px] text-bcc-text-error">
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── Step 1: email + which verified wallet to sign with ──
  return (
    <div className="flex flex-col gap-3">
      {options.length === 0 ? (
        <p className="font-serif text-[13px] text-bcc-text-secondary">
          You need at least one verified wallet on a supported chain to add
          a recovery email this way. Link and verify a wallet first.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex min-w-[220px] flex-1 flex-col gap-1.5">
              <span className="bcc-mono text-[11px] text-bcc-text-secondary">
                Recovery email
              </span>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={request.isPending}
                className="border border-bcc-input-border bg-bcc-input-bg px-3 py-2 font-serif text-bcc-text outline-none focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent disabled:opacity-50"
              />
            </label>

            <label className="flex min-w-[200px] flex-col gap-1.5">
              <span className="bcc-mono text-[11px] text-bcc-text-secondary">
                Sign with
              </span>
              <select
                value={walletKey}
                onChange={(e) => setWalletKey(e.target.value)}
                disabled={request.isPending}
                className="border border-bcc-input-border bg-bcc-input-bg px-3 py-2 font-serif text-bcc-text outline-none focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent disabled:opacity-50"
              >
                {options.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label} ·{" "}
                    {`${opt.address.slice(0, 6)}…${opt.address.slice(-4)}`}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={sendCode}
              disabled={request.isPending}
              className="bcc-stencil border border-ink bg-cardstock px-4 py-2 text-ink transition hover:bg-ink hover:text-cardstock disabled:opacity-50"
            >
              {request.isPending ? "Waiting for wallet…" : "Send code"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={request.isPending}
              className="bcc-mono text-[11px] tracking-[0.14em] text-bcc-text-secondary hover:text-bcc-text disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {error !== null && (
        <p role="alert" className="bcc-mono text-[11px] text-bcc-text-error">
          {error}
        </p>
      )}
      {/* The wallet step failed because the wallet isn't installed: on a
          phone, offer the wallet app's own browser. */}
      {selected !== undefined && request.error !== null && walletInstallUrl(request.error) !== null && (
        <OpenInWalletApp chainType={selected.chainType} />
      )}
    </div>
  );
}

/**
 * F-294 — the confirm step's copy. A wrong code answers `bcc_invalid_otp`
 * (the unified wrong-code code, as on email change) or, from a server that
 * predates the switch, `bcc_invalid_request`. Both mean "the code didn't
 * work", never "that email is unusable", so they share one line. Accepting
 * both lets the backend switch ship after this is live with no gap.
 */
const RECOVERY_WRONG_CODE =
  "That code didn't match or has expired. Check the latest email, or start over for a new code.";

export function humanizeRecoveryVerifyError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_invalid_otp: RECOVERY_WRONG_CODE,
      bcc_invalid_request: RECOVERY_WRONG_CODE,
      bcc_otp_exhausted: "Too many attempts. Start over to get a new code.",
      bcc_rate_limited: "Too many attempts. Wait a moment and try again.",
      bcc_unauthorized: "Sign in required.",
      bcc_conflict:
        "That email is already in use by another account. Try a different address.",
    },
    "Couldn't confirm the code. Try again.",
  );
}

/**
 * Recovery-email copy. The request step signs with a wallet, so route
 * provider/user-cancel errors through the shared link humanizer first;
 * that returns the provider copy when it owns the error and falls through
 * (via humanizeCode internally) to server BccApiError mapping otherwise.
 * We layer a recovery-specific copy map on top by re-mapping the codes
 * this surface cares about. Both steps branch on `.code`, never `.message`.
 */
export function humanizeRecoveryError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in required.",
      bcc_signature_invalid:
        "Wallet signature didn't verify. Try again.",
      bcc_conflict:
        "That email is already in use by another account. Try a different address.",
      bcc_invalid_request:
        "Couldn't use that email. Check the address and that you signed with a verified wallet.",
      bcc_rate_limited:
        "Too many attempts. Wait a moment and try again.",
    },
    // Fall through to provider-aware copy (wallet unavailable / user
    // cancelled) when this isn't one of the mapped server codes.
    humanizeLinkError(err),
  );
}
