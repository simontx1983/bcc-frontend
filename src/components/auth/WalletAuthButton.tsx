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
 * All three providers are supported (MetaMask / Phantom / Keplr) via
 * the shared dispatch helper in lib/wallet/dispatch.ts. The two-prompt
 * UX cost is identical regardless of provider.
 */

import { ChevronDown } from "lucide-react";
import { signIn } from "next-auth/react";
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
  /** Called after the NextAuth session is established. Parent typically router.replace()s. */
  onSuccess: () => void;
  /** mode="login" only: fires when /auth/wallet-login returns bcc_wallet_not_linked. */
  onWalletNotLinked?: () => void;
}

export function WalletAuthButton(props: WalletAuthButtonProps) {
  const [chainSlug, setChainSlug] = useState<string>(DEFAULT_SLUG);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

    setPending(true);
    try {
      const connection = await connectWallet(chainSlug, chainType);
      const signed = await fetchAndSign(chainSlug, chainType, connection);

      if (isSignup) {
        await runSignup(chainSlug, chainType, connection, signed, props);
      } else {
        await runLogin(connection, signed, props);
      }

      props.onSuccess();
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
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

      {selectedChain !== undefined && (
        <p
          className="bcc-mono"
          style={{ textAlign: "center", fontSize: 10, letterSpacing: "0.18em", color: "var(--bcc-text-muted)" }}
          aria-live="polite"
        >
          {walletHintFor(selectedChain.chainType)}
        </p>
      )}

      {error !== null && (
        <p role="alert" className="bcc-auth-error">{error}</p>
      )}
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

async function runSignup(
  chainSlug: string,
  chainType: WalletChainType,
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

  // Account created + wallet linked. The signup signature was consumed
  // server-side; we need a fresh nonce + signature to bridge to the
  // NextAuth session via /auth/wallet-login. Two provider prompts is
  // the honest UX cost — the alternative (returning a session-bridging
  // token from /auth/wallet-signup that bypasses NextAuth) is worse.
  const second = await fetchAndSign(chainSlug, chainType, connection);

  const result = await signIn("wallet", {
    wallet_address: connection.address,
    signature:      second.signature,
    extra:          JSON.stringify(second.extra),
    redirect:       false,
  });

  if (result?.error !== undefined && result.error !== null) {
    // Account exists, but auto-sign-in failed — surface and let the
    // user retry from /login.
    throw new BccApiError(
      result.error,
      "Account created, but wallet sign-in failed. Try signing in.",
      0,
      null
    );
  }
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
