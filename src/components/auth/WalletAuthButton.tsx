"use client";

/**
 * WalletAuthButton — wallet-as-credential entry point for /login + /signup.
 *
 * Two modes, one component:
 *
 *   - mode="login"  → connect → public nonce → sign → signIn("wallet").
 *                     On `bcc_wallet_not_linked`, fires `onWalletNotLinked`
 *                     so the parent can route the user to /signup with
 *                     the wallet pre-attached.
 *
 *   - mode="signup" → connect → public nonce #1 → sign #1 → POST
 *                     /auth/wallet-signup. Then a *fresh* nonce + sign
 *                     (provider prompt #2) feeds signIn("wallet") to
 *                     bridge the JWT into a NextAuth session cookie.
 *                     Two prompts because each nonce is one-shot — the
 *                     signup signature is consumed server-side and
 *                     can't be reused to mint a session.
 *
 * F-252: the two prompts are said up front and numbered while they run
 * ("Step 1 of 2" / "Step 2 of 2"). If anything fails AFTER the account
 * exists (the second nonce, the second prompt, or the sign-in), the
 * control does not show a sign-up failure and does not sign up again
 * (that would answer "already linked"): it says the account was created
 * and offers to finish signing in with the same wallet, which re-runs
 * only step 2.
 *
 * All three providers are supported (MetaMask / Phantom / Keplr) via
 * the shared dispatch helper in lib/wallet/dispatch.ts. The two-prompt
 * UX cost is identical regardless of provider.
 */

import { CheckCircle2, ChevronDown } from "lucide-react";
import { signIn } from "next-auth/react";
import Link from "next/link";
import { useState } from "react";

import {
  getPublicWalletNonce,
  walletSignup,
} from "@/lib/api/auth-endpoints";
import { BccApiError } from "@/lib/api/types";
import {
  groupedWalletChains,
  findWalletChain,
  type WalletChainType,
} from "@/lib/wallet/chain-catalog";
import {
  connectWallet,
  humanizeWalletProviderError,
  signWalletChallenge,
  walletHintFor,
  type WalletConnection,
} from "@/lib/wallet/dispatch";

// ─────────────────────────────────────────────────────────────────────
// Chain options — full catalog of providers BCC has signing flows for
// (EVM via MetaMask, Solana via Phantom, Cosmos via Keplr). The
// grouped layout renders <optgroup>s in the dropdown so the user can
// see provider context at a glance.
// ─────────────────────────────────────────────────────────────────────

const GROUPED_CHAINS = groupedWalletChains();
const DEFAULT_SLUG = GROUPED_CHAINS[0]?.options[0]?.slug ?? "ethereum";

// Stable error-code → user copy mapping. §γ: anything unmapped falls
// through to generic copy, never the server's raw err.message.
const ERROR_COPY: Record<string, string> = {
  bcc_invalid_request:        "Wallet request was malformed. Try again.",
  bcc_signature_invalid:      "Wallet signature didn't verify. Try again.",
  bcc_wallet_not_linked:      "No account is linked to this wallet.",
  bcc_wallet_already_linked:  "This wallet is already linked to another account.",
  bcc_invalid_handle:         "Pick a valid handle first (3–20 chars, lowercase + digits + hyphens).",
  bcc_handle_reserved:        "That handle is reserved.",
  bcc_conflict:               "That handle is already taken.",
  bcc_invalid_state:          "Account is missing a handle. Contact support.",
  bcc_rate_limited:           "Too many wallet attempts. Try again in a minute.",
  bcc_network_error:          "Couldn't reach the server. Check your connection.",
  bcc_unknown:                "Wallet sign-in failed. Try again.",
  CredentialsSignin:          "Wallet sign-in failed. Try again.",
};

/** What a wallet sign-up says before and during its two prompts (F-252). */
export const WALLET_SIGNUP_STEP_COPY = {
  before: "Signing up takes two wallet signatures: the first creates your account, the second signs you in.",
  step1:  "Step 1 of 2: sign to create your account.",
  step2:  "Step 2 of 2: sign once more to sign in. Your account is already created.",
} as const;

/**
 * A wallet sign-up whose account exists but whose sign-in did not finish.
 * Holds what step 2 needs to run again with the same wallet.
 */
interface UnfinishedSignup {
  chainSlug: string;
  chainType: WalletChainType;
  connection: WalletConnection;
  /** Why signing in did not finish, in the same copy as any wallet error. */
  reason: string;
}

export interface WalletAuthButtonProps {
  mode: "login" | "signup";
  /** Required when mode="signup" — server validates per §B6 too. */
  handle?: string;
  /** Optional display name for signup. */
  displayName?: string;
  /** Optional email at signup. Server falls back to a placeholder when blank. */
  email?: string;
  /** Parent can disable the whole control while its own form state is invalid/submitting. */
  disabled?: boolean;
  /**
   * Runs once the attempt actually starts — chain and handle passed local
   * checks, before the wallet is asked to connect (e.g. an analytics event).
   */
  onStart?: () => void;
  /** Called after the NextAuth session is established. Parent typically router.replace()s. */
  onSuccess: () => void;
  /** mode="login" only: fires when /auth/wallet-login returns bcc_wallet_not_linked. */
  onWalletNotLinked?: () => void;
}

export function WalletAuthButton(props: WalletAuthButtonProps) {
  const [chainSlug, setChainSlug] = useState<string>(DEFAULT_SLUG);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Which of a sign-up's two prompts is running; 0 when none is. */
  const [step, setStep] = useState<0 | 1 | 2>(0);
  /** Set once a sign-up created the account but signing in did not finish. */
  const [unfinished, setUnfinished] = useState<UnfinishedSignup | null>(null);

  const selectedChain = findWalletChain(chainSlug);
  const isSignup = props.mode === "signup";
  const buttonLabel = isSignup ? "Sign up with wallet" : "Sign in with wallet";

  async function run() {
    setError(null);

    if (selectedChain === undefined) {
      setError("Pick a supported chain.");
      return;
    }

    if (isSignup) {
      const handle = (props.handle ?? "").trim();
      if (handle === "") {
        setError("Pick a handle above first.");
        return;
      }
    }

    const chainType = selectedChain.chainType;

    props.onStart?.();
    setPending(true);
    // Filled in once the account exists. From then on a failure is not a
    // failed sign-up, and the button must not sign up a second time.
    const progress: { created: Omit<UnfinishedSignup, "reason"> | null } = { created: null };
    try {
      const connection = await connectWallet(chainSlug, chainType);

      if (isSignup) {
        setStep(1);
        const signed = await fetchAndSign(chainSlug, chainType, connection);
        await runSignup(connection, signed, props);
        progress.created = { chainSlug, chainType, connection };
        setStep(2);
        await signInWithFreshSignature(chainSlug, chainType, connection, props);
      } else {
        const signed = await fetchAndSign(chainSlug, chainType, connection);
        await runLogin(connection, signed, props);
      }

      props.onSuccess();
    } catch (err) {
      if (progress.created !== null) {
        setUnfinished({ ...progress.created, reason: humanizeError(err) });
      } else {
        setError(humanizeError(err));
      }
    } finally {
      setPending(false);
      setStep(0);
    }
  }

  /** Re-run step 2 only, with the wallet the account was created with. */
  async function finishSignIn(signup: UnfinishedSignup) {
    setPending(true);
    setStep(2);
    try {
      await signInWithFreshSignature(signup.chainSlug, signup.chainType, signup.connection, props);
      props.onSuccess();
    } catch (err) {
      setUnfinished({ ...signup, reason: humanizeError(err) });
    } finally {
      setPending(false);
      setStep(0);
    }
  }

  // One alert region, mounted with the control, whose text changes: a live
  // region inserted already holding its text is often not read (#328). It
  // shows a wallet error, or reads out the account-created notice (which
  // the panel below shows).
  const alertText =
    unfinished !== null
      ? `Account created — sign in. Signing in didn't finish: ${unfinished.reason}`
      : (error ?? "");
  const alertClass = unfinished === null && error !== null ? "bcc-auth-error" : "sr-only";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
      {unfinished !== null ? (
        // ── The account exists; signing in did not finish ─────────
        // No chain picker and no "Sign up" button: the account is created
        // and its wallet is fixed. Not gated on props.disabled either — the
        // parent's form (the handle) no longer matters.
        <div key="unfinished" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div className="bcc-auth-success">
            <div className="bcc-auth-success-icon">
              <CheckCircle2 size={20} strokeWidth={2.2} aria-hidden />
            </div>
            <p className="bcc-auth-success-title">Account created — sign in</p>
            <p className="bcc-auth-success-body">
              Your account is ready and this wallet is linked to it. Signing in
              didn&apos;t finish: {unfinished.reason}
            </p>
          </div>

          <button
            type="button"
            onClick={() => { void finishSignIn(unfinished); }}
            disabled={pending}
            className="bcc-auth-submit"
          >
            {pending ? "Waiting for wallet…" : "Sign in with wallet"}
          </button>

          {/* Mounted empty with the panel, filled while the retry runs (#328). */}
          <p
            role="status"
            className={pending ? "bcc-auth-hint" : "sr-only"}
            style={{ textAlign: "center" }}
          >
            {pending ? WALLET_SIGNUP_STEP_COPY.step2 : ""}
          </p>

          <p className="bcc-auth-hint" style={{ textAlign: "center" }}>
            You can also sign in with this wallet later from the{" "}
            <Link href="/login">sign-in page</Link>.
          </p>
        </div>
      ) : (
        <div key="form" style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <div className="bcc-auth-field">
            <label className="bcc-auth-label" htmlFor="wallet-chain">Wallet chain</label>
            <div className="bcc-auth-select-wrap">
              <select
                id="wallet-chain"
                value={chainSlug}
                onChange={(e) => setChainSlug(e.target.value)}
                disabled={pending || props.disabled === true}
                className="bcc-auth-input bcc-auth-select"
              >
                {GROUPED_CHAINS.map((group) => (
                  <optgroup key={group.chainType} label={group.label} style={{
                      background: "var(--bcc-primary)",
                      fontWeight: "bold",
                      padding: "44px 8px",
                    }}>
                    {group.options.map((opt) => (
                      <option key={opt.slug} value={opt.slug}>{opt.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <span className="bcc-auth-select-arrow" aria-hidden="true">
                <ChevronDown size={12} strokeWidth={2.5} />
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { void run(); }}
            disabled={pending || props.disabled === true}
            className="bcc-auth-submit bcc-auth-submit--outline"
          >
            {pending ? "Waiting for wallet…" : buttonLabel}
          </button>

          {/* F-252: say up front that sign-up takes two signatures, and number
              them while they run, so the second prompt is never a surprise. */}
          {isSignup && (
            <p role="status" className="bcc-auth-hint" style={{ textAlign: "center" }}>
              {step === 1
                ? WALLET_SIGNUP_STEP_COPY.step1
                : step === 2
                ? WALLET_SIGNUP_STEP_COPY.step2
                : WALLET_SIGNUP_STEP_COPY.before}
            </p>
          )}

          {selectedChain !== undefined && (
            <p
              className="bcc-mono"
              style={{ textAlign: "center", fontSize: 10, letterSpacing: "0.18em", color: "var(--bcc-text-secondary)" }}
              aria-live="polite"
            >
              {walletHintFor(selectedChain.chainType)}
            </p>
          )}
        </div>
      )}

      <p key="alert" role="alert" className={alertClass}>{alertText}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Internals — connect/sign + login/signup branches.
// ─────────────────────────────────────────────────────────────────────

async function fetchAndSign(
  chainSlug: string,
  chainType: WalletChainType,
  connection: WalletConnection,
) {
  const nonce = await getPublicWalletNonce({
    chain_slug:     chainSlug,
    wallet_address: connection.address,
  });

  return signWalletChallenge(chainSlug, chainType, connection, nonce.message);
}

async function runLogin(
  connection: WalletConnection,
  signed: { signature: string; extra: Record<string, string> },
  props: WalletAuthButtonProps,
): Promise<void> {
  const result = await signIn("wallet", {
    wallet_address: connection.address,
    signature:      signed.signature,
    extra:          JSON.stringify(signed.extra),
    redirect:       false,
  });

  if (result?.error !== undefined && result.error !== null) {
    if (result.error === "bcc_wallet_not_linked") {
      // Per Decision B(a): hand off to the parent so it can route the
      // user to /signup with the wallet pre-attached.
      props.onWalletNotLinked?.();
      // Throw so the parent's onSuccess does NOT fire — onWalletNotLinked
      // is the terminal callback for this branch.
      throw new BccApiError(
        "bcc_wallet_not_linked",
        ERROR_COPY["bcc_wallet_not_linked"] ?? "No account is linked to this wallet.",
        404,
        null
      );
    }
    throw new BccApiError(
      result.error,
      ERROR_COPY[result.error] ?? "Wallet sign-in failed.",
      0,
      null
    );
  }
}

/** Step 1 of a sign-up: create the account and link the wallet. */
async function runSignup(
  connection: WalletConnection,
  signed: { signature: string; extra: Record<string, string> },
  props: WalletAuthButtonProps,
): Promise<void> {
  const handle = (props.handle ?? "").trim().toLowerCase();
  const displayName = (props.displayName ?? "").trim();
  const emailRaw = (props.email ?? "").trim();

  await walletSignup({
    wallet_address: connection.address,
    signature:      signed.signature,
    extra:          signed.extra,
    handle,
    ...(displayName !== "" ? { display_name: displayName } : {}),
    ...(emailRaw !== ""    ? { email: emailRaw } : {}),
  });
}

/**
 * Step 2 of a sign-up, and the whole of its retry: sign in with the wallet
 * the account was just created with.
 *
 * The signup signature was consumed server-side, so this needs a fresh
 * nonce + signature to bridge to the NextAuth session via
 * /auth/wallet-login. Two provider prompts is the honest UX cost — the
 * alternative (returning a session-bridging token from
 * /auth/wallet-signup that bypasses NextAuth) is worse.
 */
async function signInWithFreshSignature(
  chainSlug: string,
  chainType: WalletChainType,
  connection: WalletConnection,
  props: WalletAuthButtonProps,
): Promise<void> {
  const signed = await fetchAndSign(chainSlug, chainType, connection);
  await runLogin(connection, signed, props);
}

function humanizeError(err: unknown): string {
  // Provider-side errors (Keplr / MetaMask / Phantom unavailable, user
  // cancel, unsupported chain, etc.) — dispatch.ts owns the copy.
  const provider = humanizeWalletProviderError(err);
  if (provider !== null) return provider;

  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? "Wallet sign-in failed. Try again.";
  }
  if (err instanceof Error) {
    return ERROR_COPY[err.message] ?? "Wallet sign-in failed. Try again.";
  }
  return "Wallet sign-in failed. Try again.";
}
