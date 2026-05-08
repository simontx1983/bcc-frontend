"use client";

/**
 * §V1.5 — linked wallets list + link/unlink.
 *
 * Lives on /settings/identity beside the OAuth Connections section.
 *
 * Link path (added 2026-04-30, alongside wallet-as-credential auth):
 * a "Link wallet" form sits at the top of the section so users can
 * attach additional wallets without going through the §N8 claim flow.
 * The §N8 claim flow on validator/creator profiles still works — both
 * paths land in /auth/wallet-link the same way.
 *
 * Empty state: explains where wallets come from + reminds the user
 * the link form above is the easiest way to add one.
 *
 * Unlink confirmation: a single-click "Unlink" with a confirm dialog.
 * The mutation is idempotent on the server, so a stale row in the UI
 * after an unlink-from-another-tab is self-healing on the next refetch.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { MY_WALLETS_QUERY_KEY, useMyWallets, useUnlinkWallet } from "@/hooks/useWallets";
import { getWalletNonce, linkWallet } from "@/lib/api/auth-endpoints";
import { BccApiError, type LinkedWallet } from "@/lib/api/types";
import { formatShortDate } from "@/lib/format";
import {
  connectKeplr,
  KeplrError,
  KeplrUnavailableError,
  KeplrUserRejectedError,
  signKeplrChallenge,
} from "@/lib/wallet/keplr";

export function WalletsSection() {
  const wallets = useMyWallets();
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  const unlink = useUnlinkWallet({
    onSuccess: () => {
      setConfirmingId(null);
      setErrorText(null);
    },
    onError: (err) => {
      setErrorText(humanizeError(err));
    },
  });

  return (
    <div className="bcc-panel flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          IDENTITY · WALLETS
        </span>
        <h2 className="bcc-stencil text-2xl text-ink">Linked wallets</h2>
        <p className="font-serif text-sm text-ink-soft">
          Wallets you&apos;ve verified by signing a challenge. Each one
          unlocks on-chain credentials on your profile and lets you sign
          disputes.
        </p>
      </header>

      <LinkWalletForm />

      {wallets.isLoading ? (
        <p className="bcc-mono text-[11px] text-ink-soft/70">Checking…</p>
      ) : wallets.isError ? (
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          Couldn&apos;t load your wallets. Refresh and try again.
        </p>
      ) : wallets.data === undefined || wallets.data.items.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="flex flex-col gap-2">
          {wallets.data.items.map((wallet) => (
            <WalletRow
              key={wallet.id}
              wallet={wallet}
              isConfirming={confirmingId === wallet.id}
              isUnlinking={unlink.isPending && unlink.variables === wallet.id}
              onAskConfirm={() => {
                setErrorText(null);
                setConfirmingId(wallet.id);
              }}
              onCancelConfirm={() => setConfirmingId(null)}
              onConfirmUnlink={() => {
                setErrorText(null);
                unlink.mutate(wallet.id);
              }}
            />
          ))}
        </ul>
      )}

      {errorText !== null && (
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          {errorText}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Link form — chain dropdown + "Link wallet" button. V1 wallet support
// is Cosmos-only via Keplr; the chain slugs match the bcc-trust
// ChainRepository entries (cosmos, osmosis, injective, juno, stargaze)
// per the same constraint as <WalletAuthButton>. The Keplr on-chain
// chain_id (`cosmoshub-4` etc.) is mapped from the slug in keplr.ts.
// ─────────────────────────────────────────────────────────────────────

const LINK_CHAIN_OPTIONS: ReadonlyArray<{ slug: string; label: string }> = [
  { slug: "cosmos",    label: "Cosmos Hub" },
  { slug: "osmosis",   label: "Osmosis"    },
  { slug: "injective", label: "Injective"  },
  { slug: "juno",      label: "Juno"       },
  { slug: "stargaze",  label: "Stargaze"   },
];

function LinkWalletForm() {
  const queryClient = useQueryClient();
  const [chainSlug, setChainSlug] = useState<string>("cosmos");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function run() {
    setError(null);
    setSuccess(null);
    setPending(true);

    try {
      const connection = await connectKeplr(chainSlug);

      const nonce = await getWalletNonce({
        chain_slug:     connection.chainSlug,
        wallet_address: connection.address,
      });

      const signed = await signKeplrChallenge(
        connection.chainSlug,
        connection.address,
        nonce.message
      );

      const response = await linkWallet({
        wallet_address: connection.address,
        signature:      signed.signature,
        wallet_type:    "keplr",
        // pub_key + chain_id MUST live inside `extra` — that's where
        // the cosmos verifier reads them per WalletVerifier::verify.
        extra: { pub_key: signed.pubKey, chain_id: connection.chainId },
      });

      void queryClient.invalidateQueries({ queryKey: MY_WALLETS_QUERY_KEY });
      // The user view-model holds wallet badges; refresh them too.
      void queryClient.invalidateQueries({ queryKey: ["users"] });

      setSuccess(`Linked ${response.chain_name || response.chain_slug} wallet.`);
    } catch (err) {
      setError(humanizeLinkError(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 border border-cardstock-edge bg-cardstock-deep/30 p-4">
      <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
        LINK NEW WALLET
      </span>

      <div className="flex flex-wrap items-end gap-2">
        <label className="flex min-w-[180px] flex-1 flex-col gap-1.5">
          <span className="bcc-mono text-[11px] text-ink-soft">Chain</span>
          <select
            value={chainSlug}
            onChange={(e) => setChainSlug(e.target.value)}
            disabled={pending}
            className="border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint disabled:opacity-50"
          >
            {LINK_CHAIN_OPTIONS.map((opt) => (
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
          disabled={pending}
          className="bcc-stencil border border-ink bg-cardstock px-4 py-2 text-ink transition hover:bg-ink hover:text-cardstock disabled:opacity-50"
        >
          {pending ? "Waiting for wallet…" : "Link wallet"}
        </button>
      </div>

      {error !== null && (
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          {error}
        </p>
      )}
      {success !== null && (
        <p className="bcc-mono text-[11px]" style={{ color: "var(--verified)" }}>
          {success}
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────

interface WalletRowProps {
  wallet: LinkedWallet;
  isConfirming: boolean;
  isUnlinking: boolean;
  onAskConfirm: () => void;
  onCancelConfirm: () => void;
  onConfirmUnlink: () => void;
}

function WalletRow({
  wallet,
  isConfirming,
  isUnlinking,
  onAskConfirm,
  onCancelConfirm,
  onConfirmUnlink,
}: WalletRowProps) {
  const explorerHref =
    wallet.explorer_url !== ""
      ? `${wallet.explorer_url.replace(/\/$/, "")}/address/${wallet.wallet_address}`
      : null;

  return (
    <li className="flex flex-wrap items-start justify-between gap-3 border border-cardstock-edge bg-cardstock-deep/40 p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="bcc-stencil text-sm uppercase text-ink">
            {wallet.chain_name || wallet.chain_slug}
          </span>
          {wallet.is_primary && (
            <span
              className="bcc-mono border border-verified/50 px-1.5 py-0.5 text-[9px] tracking-[0.18em]"
              style={{ color: "var(--verified)" }}
            >
              PRIMARY
            </span>
          )}
          {!wallet.verified && (
            <span className="bcc-mono border border-safety/50 px-1.5 py-0.5 text-[9px] tracking-[0.18em] text-safety">
              UNVERIFIED
            </span>
          )}
        </div>

        <code className="bcc-mono block max-w-full truncate text-[11px] text-ink-soft">
          {wallet.wallet_address}
        </code>

        <div className="bcc-mono flex flex-wrap gap-3 text-[10px] text-ink-soft/70">
          {wallet.created_at !== null && (
            <span>Linked {formatShortDate(wallet.created_at)}</span>
          )}
          {explorerHref !== null && (
            <a
              href={explorerHref}
              target="_blank"
              rel="noreferrer noopener"
              className="text-blueprint hover:underline"
            >
              View on explorer ↗
            </a>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {isConfirming ? (
          <>
            <button
              type="button"
              onClick={onCancelConfirm}
              disabled={isUnlinking}
              className="bcc-mono border-2 border-cardstock-edge px-3 py-1.5 text-[10px] tracking-[0.18em] text-ink-soft hover:border-ink/50 hover:text-ink disabled:opacity-50"
            >
              CANCEL
            </button>
            <button
              type="button"
              onClick={onConfirmUnlink}
              disabled={isUnlinking}
              className="bcc-mono border-2 border-safety px-3 py-1.5 text-[10px] tracking-[0.18em] text-safety hover:bg-safety hover:text-cardstock disabled:opacity-50"
            >
              {isUnlinking ? "UNLINKING…" : "CONFIRM UNLINK"}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onAskConfirm}
            className="bcc-mono border-2 border-cardstock-edge px-3 py-1.5 text-[11px] tracking-[0.18em] text-ink-soft hover:border-safety hover:text-safety"
          >
            Unlink
          </button>
        )}
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col gap-2 border border-dashed border-cardstock-edge bg-cardstock-deep/20 p-4">
      <p className="bcc-mono text-[11px] text-ink-soft">No wallets linked yet.</p>
      <p className="font-serif text-[13px] text-ink-soft">
        Pick a chain above and sign a challenge with Keplr — once
        verified, the wallet shows up here. You can also link a wallet
        through the claim flow on any validator or creator profile.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function humanizeError(err: BccApiError): string {
  switch (err.code) {
    case "bcc_unauthorized":
      return "Sign in required.";
    case "bcc_rate_limited":
      return "Too many requests. Wait a moment and retry.";
    case "bcc_invalid_request":
      return "Couldn't unlink that wallet. Refresh and try again.";
    default:
      return err.message !== "" ? err.message : "Couldn't unlink. Try again.";
  }
}

function humanizeLinkError(err: unknown): string {
  if (err instanceof KeplrUnavailableError) {
    return "Keplr extension not detected. Install Keplr to continue.";
  }
  if (err instanceof KeplrUserRejectedError) {
    return "Wallet signing was canceled.";
  }
  if (err instanceof KeplrError) {
    return err.message;
  }
  if (err instanceof BccApiError) {
    switch (err.code) {
      case "bcc_unauthorized":
        return "Sign in required.";
      case "bcc_rate_limited":
        return "Too many wallet attempts. Wait a moment and retry.";
      case "bcc_signature_invalid":
        return "Wallet signature didn't verify. Try again.";
      case "bcc_conflict":
        return "This wallet is already linked.";
      default:
        return err.message !== "" ? err.message : "Couldn't link the wallet.";
    }
  }
  if (err instanceof Error) {
    return err.message;
  }
  return "Couldn't link the wallet.";
}

