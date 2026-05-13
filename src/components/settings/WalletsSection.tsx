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
import { humanizeCode } from "@/lib/api/errors";
import { BccApiError, type LinkedWallet } from "@/lib/api/types";
import { formatShortDate } from "@/lib/format";
import {
  findWalletChain,
  groupedWalletChains,
  type WalletChainType,
} from "@/lib/wallet/chain-catalog";
import {
  connectKeplr,
  KeplrError,
  KeplrUnavailableError,
  KeplrUserRejectedError,
  signKeplrChallenge,
} from "@/lib/wallet/keplr";
import {
  connectMetaMask,
  MetaMaskError,
  MetaMaskUnavailableError,
  MetaMaskUserRejectedError,
  signMetaMaskChallenge,
} from "@/lib/wallet/metamask";
import {
  connectPhantom,
  PhantomError,
  PhantomUnavailableError,
  PhantomUserRejectedError,
  signPhantomChallenge,
} from "@/lib/wallet/phantom";

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
// Link form — chain dropdown + "Link wallet" button. Three signing
// flows (EVM via MetaMask, Solana via Phantom, Cosmos via Keplr) are
// dispatched on the catalog's `chainType` for the selected chain.
//
// All three flows hit /auth/wallet-link with the same shape; only the
// `wallet_type` label and the contents of `extra` differ:
//   - EVM    → wallet_type='metamask', extra={}
//   - Solana → wallet_type='phantom',  extra={}
//   - Cosmos → wallet_type='keplr',    extra={pub_key, chain_id}
//
// The cosmos `extra` payload is mandatory — `WalletVerifier::verify`
// reads pub_key + chain_id from there for ADR-036 verification (the
// EthSignatureVerifier and SolanaSignatureVerifier ignore `extra`
// entirely; their signatures self-disclose the signer pubkey).
//
// Catalog source: lib/wallet/chain-catalog.ts. Adding a chain there
// is the only step required to surface it here.
// ─────────────────────────────────────────────────────────────────────

const GROUPED_CHAINS = groupedWalletChains();
const DEFAULT_SLUG = GROUPED_CHAINS[0]?.options[0]?.slug ?? "ethereum";

function LinkWalletForm() {
  const queryClient = useQueryClient();
  const [chainSlug, setChainSlug] = useState<string>(DEFAULT_SLUG);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const selectedChain = findWalletChain(chainSlug);

  async function run() {
    if (selectedChain === undefined) {
      setError("Pick a supported chain.");
      return;
    }
    setError(null);
    setSuccess(null);
    setPending(true);

    try {
      const linked = await runLinkFlow(selectedChain.slug, selectedChain.chainType);

      const response = await linkWallet({
        wallet_address: linked.address,
        signature:      linked.signature,
        wallet_type:    linked.walletType,
        extra:          linked.extra,
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
        <label className="flex min-w-[200px] flex-1 flex-col gap-1.5">
          <span className="bcc-mono text-[11px] text-ink-soft">Chain</span>
          <select
            value={chainSlug}
            onChange={(e) => setChainSlug(e.target.value)}
            disabled={pending}
            className="border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint disabled:opacity-50"
          >
            {GROUPED_CHAINS.map((group) => (
              <optgroup key={group.chainType} label={group.label}>
                {group.options.map((opt) => (
                  <option key={opt.slug} value={opt.slug}>
                    {opt.label}
                  </option>
                ))}
              </optgroup>
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

      {selectedChain !== undefined && (
        <p
          className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft"
          aria-live="polite"
        >
          {walletHintFor(selectedChain.chainType)}
        </p>
      )}

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
// runLinkFlow — connect → request nonce → sign → return the bundle the
// /auth/wallet-link POST needs. All three branches share the same
// outer shape so the caller doesn't care which provider answered.
// ─────────────────────────────────────────────────────────────────────

interface LinkFlowResult {
  address: string;
  signature: string;
  walletType: string;
  extra: Record<string, string>;
}

async function runLinkFlow(
  chainSlug: string,
  chainType: WalletChainType,
): Promise<LinkFlowResult> {
  if (chainType === "evm") {
    const chain = findWalletChain(chainSlug);
    const desiredHex = chain?.chainIdHex ?? "";
    const connection = await connectMetaMask(desiredHex);

    const nonce = await getWalletNonce({
      chain_slug:     chainSlug,
      wallet_address: connection.address,
    });

    const signed = await signMetaMaskChallenge(connection.address, nonce.message);

    return {
      address:    connection.address,
      signature:  signed.signature,
      walletType: "metamask",
      extra:      {},
    };
  }

  if (chainType === "solana") {
    const connection = await connectPhantom();

    const nonce = await getWalletNonce({
      chain_slug:     chainSlug,
      wallet_address: connection.address,
    });

    const signed = await signPhantomChallenge(nonce.message);

    return {
      address:    connection.address,
      signature:  signed.signature,
      walletType: "phantom",
      extra:      {},
    };
  }

  // Cosmos (default branch) — Keplr ADR-036 flow.
  const connection = await connectKeplr(chainSlug);

  const nonce = await getWalletNonce({
    chain_slug:     connection.chainSlug,
    wallet_address: connection.address,
  });

  const signed = await signKeplrChallenge(
    connection.chainSlug,
    connection.address,
    nonce.message,
  );

  return {
    address:    connection.address,
    signature:  signed.signature,
    walletType: "keplr",
    // pub_key + chain_id MUST live inside `extra` — that's where the
    // cosmos verifier reads them per WalletVerifier::verify.
    extra: { pub_key: signed.pubKey, chain_id: connection.chainId },
  };
}

function walletHintFor(chainType: WalletChainType): string {
  switch (chainType) {
    case "evm":
      return "SIGNS WITH METAMASK (OR ANY EIP-1193 EVM WALLET)";
    case "solana":
      return "SIGNS WITH PHANTOM (OR ANOTHER SOLANA WALLET)";
    case "cosmos":
      return "SIGNS WITH KEPLR";
  }
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
        Pick a chain above and sign a challenge with the matching wallet
        &mdash; MetaMask for EVM chains, Phantom for Solana, Keplr for
        Cosmos. Once verified, the wallet shows up here. You can also
        link a wallet through the claim flow on any validator or creator
        profile.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function humanizeError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in required.",
      bcc_rate_limited: "Too many requests. Wait a moment and retry.",
      bcc_invalid_request: "Couldn't unlink that wallet. Refresh and try again.",
      bcc_not_found: "That wallet is no longer linked.",
      bcc_forbidden: "You can't unlink that wallet.",
    },
    "Couldn't unlink. Try again.",
  );
}

function humanizeLinkError(err: unknown): string {
  // Per-provider unavailable paths carry typed errors with copy authored
  // at construction time — those are presentation strings owned by our
  // own code, not server-supplied. Pass them through.
  if (
    err instanceof KeplrUnavailableError ||
    err instanceof MetaMaskUnavailableError ||
    err instanceof PhantomUnavailableError
  ) {
    return err.message;
  }
  // User-cancel is a uniform UX surface across the three wallets.
  if (
    err instanceof KeplrUserRejectedError ||
    err instanceof MetaMaskUserRejectedError ||
    err instanceof PhantomUserRejectedError
  ) {
    return "Wallet signing was canceled.";
  }
  // Other typed wallet errors are constructed by us with deliberate copy.
  if (
    err instanceof KeplrError ||
    err instanceof MetaMaskError ||
    err instanceof PhantomError
  ) {
    return err.message;
  }
  // Server-side BccApiError envelopes branch on `.code`, never `.message`.
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in required.",
      bcc_rate_limited: "Too many wallet attempts. Wait a moment and retry.",
      bcc_signature_invalid: "Wallet signature didn't verify. Try again.",
      bcc_conflict: "This wallet is already linked.",
      bcc_invalid_request: "Couldn't link the wallet. Check the chain selection.",
      bcc_wallet_not_supported: "That wallet chain isn't supported yet.",
    },
    "Couldn't link the wallet.",
  );
}

