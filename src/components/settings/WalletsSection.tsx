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
import { useRef, useState } from "react";

import {
  useRequestRecoveryEmail,
  useVerifyRecoveryEmail,
} from "@/hooks/useRecoveryEmail";
import { MY_WALLETS_QUERY_KEY, useMyWallets, useUnlinkWallet } from "@/hooks/useWallets";
import { linkWallet } from "@/lib/api/auth-endpoints";
import { humanizeCode } from "@/lib/api/errors";
import type { LinkedWallet } from "@/lib/api/types";
import { formatShortDate } from "@/lib/format";
import {
  findWalletChain,
  groupedWalletChains,
  type WalletChainType,
} from "@/lib/wallet/chain-catalog";
import { walletHintFor } from "@/lib/wallet/dispatch";
import { humanizeLinkError, runLinkFlow } from "@/lib/wallet/linkFlow";
import { CollectionStancePanel } from "@/components/onchain/CollectionStancePanel";

export function WalletsSection() {
  const wallets = useMyWallets();
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);

  // The recovery banner's "or link another wallet" secondary action focuses
  // the existing link form's chain <select> so the user lands on the right
  // control without a separate page or duplicate form.
  const linkChainSelectRef = useRef<HTMLSelectElement | null>(null);
  function focusLinkForm() {
    const el = linkChainSelectRef.current;
    if (el !== null) {
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      el.focus();
    }
  }

  const unlink = useUnlinkWallet({
    onSuccess: () => {
      setConfirmingId(null);
      setErrorText(null);
    },
    onError: (err) => {
      setErrorText(humanizeError(err));
    },
  });

  const verifiedWallets =
    wallets.data?.items.filter((w) => w.verified) ?? [];
  const showRecoveryBanner =
    wallets.data?.recovery?.has_recovery_email === false;
  const verifiedWalletCount =
    wallets.data?.recovery?.verified_wallet_count ?? 0;

  return (
    <div className="bcc-panel flex flex-col gap-4 p-6">
      <header className="flex flex-col gap-1">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          IDENTITY · WALLETS
        </span>
        <h2 className="bcc-stencil text-2xl text-bcc-text">Linked wallets</h2>
        <p className="font-serif text-sm text-bcc-text-secondary">
          Wallets you&apos;ve verified by signing a challenge. Each one
          unlocks on-chain credentials on your profile and lets you sign
          disputes.
        </p>
      </header>

      {showRecoveryBanner && (
        <RecoveryEmailPanel
          verifiedWalletCount={verifiedWalletCount}
          verifiedWallets={verifiedWallets}
          onLinkAnotherWallet={focusLinkForm}
        />
      )}

      <LinkWalletForm chainSelectRef={linkChainSelectRef} />

      {wallets.isLoading ? (
        <p className="bcc-mono text-[11px] text-bcc-text-secondary/70">Checking…</p>
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

interface LinkWalletFormProps {
  chainSelectRef?: React.RefObject<HTMLSelectElement | null>;
}

function LinkWalletForm({ chainSelectRef }: LinkWalletFormProps) {
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
            ref={chainSelectRef}
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

      {/* The moment of maximum intent: the wallet just linked, its
          collections were just discovered server-side — ask the user
          which communities they actually want (and which holdings are
          airdropped junk) right here rather than hoping they find the
          affordance later. */}
      {success !== null && (
        <div className="mt-2 border-t border-dashed border-ink/20 pt-3">
          <CollectionStancePanel />
        </div>
      )}
    </div>
  );
}

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
// ─────────────────────────────────────────────────────────────────────

interface RecoveryEmailPanelProps {
  verifiedWalletCount: number;
  verifiedWallets: LinkedWallet[];
  onLinkAnotherWallet: () => void;
}

function RecoveryEmailPanel({
  verifiedWalletCount,
  verifiedWallets,
  onLinkAnotherWallet,
}: RecoveryEmailPanelProps) {
  const [formOpen, setFormOpen] = useState(false);

  const urgent = verifiedWalletCount <= 1;

  return (
    <div className="flex flex-col gap-3 border border-safety/50 bg-safety/5 p-4">
      <div className="flex flex-col gap-1">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-safety">
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
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setFormOpen(true)}
            className="bcc-stencil border border-ink bg-cardstock px-4 py-2 text-ink transition hover:bg-ink hover:text-cardstock"
          >
            Add recovery email
          </button>
          <button
            type="button"
            onClick={onLinkAnotherWallet}
            className="bcc-mono text-[11px] tracking-[0.14em] text-blueprint hover:underline"
          >
            or link another wallet
          </button>
        </div>
      )}
    </div>
  );
}

// Eligible signing options for the recovery proof: one entry per
// verified wallet whose chain has a frontend signing flow (catalog hit).
// chain_type comes off the wallet row but we resolve the catalog's
// chainType so the dispatch tag is authoritative (server vs catalog
// strings agree today, but the catalog owns the signing-flow mapping).
interface RecoveryChainOption {
  /** Stable key for the <option> — wallet id, so duplicate chains stay distinct. */
  key: string;
  slug: string;
  chainType: WalletChainType;
  label: string;
  address: string;
}

function recoveryChainOptions(
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

function RecoveryEmailForm({
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
    },
    onError: (err) => setError(humanizeRecoveryError(err)),
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
              className="bcc-mono w-[8rem] border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 tracking-[0.3em] text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint disabled:opacity-50"
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
          <p role="alert" className="bcc-mono text-[11px] text-safety">
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
                className="border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint disabled:opacity-50"
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
                className="border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint disabled:opacity-50"
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
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          {error}
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
      bcc_last_recovery_method:
        "This is your only verified wallet and your account has no recovery email. Add a recovery email or link another wallet first.",
    },
    "Couldn't unlink. Try again.",
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
function humanizeRecoveryError(err: unknown): string {
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


