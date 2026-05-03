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
 *                     (Keplr prompt #2) feeds signIn("wallet") to bridge
 *                     the JWT into a NextAuth session cookie. Two prompts
 *                     because each nonce is one-shot — we can't reuse the
 *                     signup signature to mint a session.
 *
 * V1 wallet support is Cosmos-only via Keplr (per src/lib/wallet/keplr.ts).
 * EVM / Solana adapters are V2; the prop surface stays neutral so adding
 * them is a strict addition rather than a rename.
 */

import { signIn } from "next-auth/react";
import { useState } from "react";

import {
  getPublicWalletNonce,
  walletSignup,
} from "@/lib/api/auth-endpoints";
import { BccApiError } from "@/lib/api/types";
import {
  connectKeplr,
  KeplrError,
  KeplrUnavailableError,
  KeplrUserRejectedError,
  signKeplrChallenge,
  type KeplrConnection,
} from "@/lib/wallet/keplr";

// ─────────────────────────────────────────────────────────────────────
// Chain options — V1 wallet auth is Cosmos-only via Keplr. Slugs match
// the bcc-trust ChainRepository entries (see backend's /auth/wallet-nonce
// validator), NOT the §B4 home_chain slugs (which use "cosmos" rather
// than "cosmoshub"). Different domain, different vocabulary.
// ─────────────────────────────────────────────────────────────────────

const CHAIN_OPTIONS: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: "cosmoshub", label: "Cosmos Hub" },
  { slug: "osmosis",   label: "Osmosis"    },
  { slug: "injective", label: "Injective"  },
  { slug: "juno",      label: "Juno"       },
  { slug: "stargaze",  label: "Stargaze"   },
];

const DEFAULT_CHAIN = "cosmoshub";

// Stable error-code → user copy mapping. Anything unmapped falls
// through to the message string we already have in hand.
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
  const [chainSlug, setChainSlug] = useState<string>(DEFAULT_CHAIN);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSignup = props.mode === "signup";
  const buttonLabel = isSignup ? "Sign up with wallet" : "Sign in with wallet";

  async function run() {
    setError(null);

    if (isSignup) {
      const handle = (props.handle ?? "").trim();
      if (handle === "") {
        setError("Pick a handle above first.");
        return;
      }
    }

    setPending(true);
    try {
      const connection = await connectKeplr(chainSlug);
      const signed = await fetchAndSign(connection);
      const extra = { pub_key: signed.pubKey, chain_id: connection.chainId };

      if (isSignup) {
        await runSignup(connection, signed.signature, extra, props);
      } else {
        await runLogin(connection, signed.signature, extra, props);
      }

      props.onSuccess();
    } catch (err) {
      setError(humanizeError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5">
        <span className="bcc-mono text-ink-soft">Wallet chain</span>
        <select
          value={chainSlug}
          onChange={(e) => setChainSlug(e.target.value)}
          disabled={pending || props.disabled === true}
          className="border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint disabled:opacity-50"
        >
          {CHAIN_OPTIONS.map((opt) => (
            <option key={opt.slug} value={opt.slug}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>

      <button
        type="button"
        onClick={() => {
          void run();
        }}
        disabled={pending || props.disabled === true}
        className="bcc-stencil border border-ink bg-cardstock py-3 text-ink transition hover:bg-ink hover:text-cardstock disabled:opacity-50"
      >
        {pending ? "Waiting for wallet…" : buttonLabel}
      </button>

      {error !== null && (
        <p role="alert" className="bcc-mono text-center text-safety">
          {error}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Internals
// ─────────────────────────────────────────────────────────────────────

async function fetchAndSign(connection: KeplrConnection) {
  const nonce = await getPublicWalletNonce({
    chain_slug:     connection.chainSlug,
    wallet_address: connection.address,
  });

  const signed = await signKeplrChallenge(
    connection.chainSlug,
    connection.address,
    nonce.message
  );

  return signed;
}

async function runLogin(
  connection: KeplrConnection,
  signature: string,
  extra: Record<string, unknown>,
  props: WalletAuthButtonProps
): Promise<void> {
  const result = await signIn("wallet", {
    wallet_address: connection.address,
    signature,
    extra: JSON.stringify(extra),
    redirect: false,
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
  connection: KeplrConnection,
  signature: string,
  extra: Record<string, unknown>,
  props: WalletAuthButtonProps
): Promise<void> {
  const handle = (props.handle ?? "").trim().toLowerCase();
  const displayName = (props.displayName ?? "").trim();
  const emailRaw = (props.email ?? "").trim();

  await walletSignup({
    wallet_address: connection.address,
    signature,
    extra,
    handle,
    ...(displayName !== "" ? { display_name: displayName } : {}),
    ...(emailRaw !== ""    ? { email: emailRaw } : {}),
  });

  // Account created + wallet linked. The signup signature was consumed
  // server-side; we need a fresh nonce + signature to bridge to the
  // NextAuth session via /auth/wallet-login. Two Keplr prompts is the
  // honest UX cost — the alternative (returning a session-bridging
  // token from /auth/wallet-signup that bypasses NextAuth) is worse.
  const second = await fetchAndSign(connection);

  const result = await signIn("wallet", {
    wallet_address: connection.address,
    signature: second.signature,
    extra: JSON.stringify({ pub_key: second.pubKey, chain_id: connection.chainId }),
    redirect: false,
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
  if (err instanceof KeplrUnavailableError) {
    return "Keplr extension not detected. Install Keplr to continue.";
  }
  if (err instanceof KeplrUserRejectedError) {
    return "Wallet signing was canceled.";
  }
  if (err instanceof BccApiError) {
    return ERROR_COPY[err.code] ?? err.message;
  }
  if (err instanceof KeplrError) {
    return err.message;
  }
  if (err instanceof Error) {
    return ERROR_COPY[err.message] ?? err.message;
  }
  return "Wallet sign-in failed. Try again.";
}
