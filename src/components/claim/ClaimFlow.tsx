"use client";

/**
 * ClaimFlow — §N8 four-step guided modal for claiming a validator
 * page by signing a challenge with the operator wallet.
 *
 * Per §N8: friction here is *good* — slow the user down before a
 * high-stakes action. The four steps are explicit screens, never
 * collapsed into one dense form:
 *
 *   1. Explanation — plain English ("Are you the operator?")
 *   2. Wallet connect — Keplr prompt for the chain
 *   3. Signature — server-issued challenge, signed via signArbitrary
 *   4. Confirmation — success state with "What's next" links
 *
 * Each step is its own panel. Errors at any step keep the user on
 * the same step (no silent skip-back) so they can retry.
 *
 * Chain support is decided by what the BACKEND can prove about
 * validator operator authority, not by which wallets exist (the allowlist
 * lives in `lib/wallet/claim-support.ts`):
 *
 *   cosmos   ✅ the operator account and the `…valoper…` address are the
 *               same 20 bytes under a different bech32 HRP.
 *   polkadot ✅ `operator_address` is the validator's STASH account, an
 *               account the operator holds and can sign with.
 *   solana   ⛔ `operator_address` is the vote account's `nodePubkey` —
 *               the validator IDENTITY key, which lives on the validator
 *               host. The authority that actually controls a vote account
 *               (`authorizedWithdrawer`) is not stored at all, so there is
 *               nothing to prove against. Adding Phantom would either match
 *               nothing or invite operators to load a hot signing key into
 *               a browser wallet. Deliberately unavailable.
 *   evm      ⛔ no EVM validator pages exist — EvmFetcher returns no
 *               validators by design, so there is nothing to claim.
 *
 * ⚠ Provider work goes through `lib/wallet/dispatch.ts`, the shared
 * chainType → adapter layer. We use `connectWallet`, then the shared
 * `signLinkChallenge` + `linkOrConfirmOwnWallet` (lib/wallet/linkFlow),
 * rather than the one-call `runLinkFlow`, because this surface keeps the §N8
 * FOUR-STEP machine (connect and sign are separate screens, on purpose —
 * friction before a high-stakes action). `runLinkFlow` is a one-call
 * composition of the same dispatch layer for the Settings form; please do
 * not "simplify" this into it and collapse the step machine.
 *
 * Cache invalidation on success: the parent <EntityProfile> route is
 * a server component. We call `router.refresh()` so the next paint
 * re-fetches the card view-model with `is_claimed: true` and the
 * unclaimed callout disappears.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { captureAnalyticsEvent } from "@/lib/analytics/posthog";
import { humanizeCode } from "@/lib/api/errors";
import { claimPage } from "@/lib/api/pages-endpoints";
import { type CardClaimTarget } from "@/lib/api/types";
import { findWalletChain, type WalletChainType } from "@/lib/wallet/chain-catalog";
import { isChainClaimable, unsupportedClaimReason } from "@/lib/wallet/claim-support";
import {
  connectWallet,
  humanizeWalletProviderError,
  type WalletConnection,
} from "@/lib/wallet/dispatch";
import { linkOrConfirmOwnWallet, signLinkChallenge } from "@/lib/wallet/linkFlow";
import { Dialog } from "@/components/ui/Dialog";

/**
 * The wallet an operator actually opens, per chain. Used in copy only —
 * the provider itself is resolved by dispatch.ts. `null` (chain not in
 * the catalog, or not claimable) gets a neutral label so no screen
 * promises a wallet that cannot complete the flow.
 */
function walletNameFor(chainType: WalletChainType | null): string {
  switch (chainType) {
    case "cosmos":
      return "Keplr";
    case "polkadot":
      return "Polkadot.js, Talisman or SubWallet";
    case "evm":
      return "MetaMask";
    case "solana":
      return "Phantom";
    default:
      return "your wallet";
  }
}

interface ClaimFlowProps {
  pageId: number;
  pageName: string;
  /** Server-resolved entity_type + entity_id + chain_slug. */
  target: CardClaimTarget;
  onClose: () => void;
}

type Step =
  | { kind: "explanation" }
  | { kind: "connect"; pending: boolean; error: string | null }
  | {
      kind: "signature";
      connection: WalletConnection;
      chainType: WalletChainType;
      pending: boolean;
      error: string | null;
    }
  | { kind: "confirmation" };

export function ClaimFlow({ pageId, pageName, target, onClose }: ClaimFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "explanation" });

  // ── Step 2: Connect the chain's wallet ─────────────────────────────
  const chainType = findWalletChain(target.chain_slug)?.chainType ?? null;
  const claimable = chainType !== null && isChainClaimable(target.chain_slug);

  const handleConnect = async () => {
    // The attempt starts when the operator commits to it. The chain slug
    // is the only property: no page, entity or wallet identifiers.
    captureAnalyticsEvent("claim_started", { chain: target.chain_slug });
    if (!claimable) {
      setStep({
        kind: "connect",
        pending: false,
        error: unsupportedClaimReason(target.chain_slug),
      });
      return;
    }
    setStep({ kind: "connect", pending: true, error: null });
    try {
      // The shared wallet layer (lib/wallet/dispatch), not a parallel
      // provider path: §11, and the signed bundle it produces is what the
      // backend verifier reads.
      const connection = await connectWallet(target.chain_slug, chainType);
      setStep({ kind: "signature", connection, chainType, pending: false, error: null });
    } catch (err) {
      setStep({
        kind: "connect",
        pending: false,
        error: humanizeWalletError(err),
      });
    }
  };

  // ── Step 3: Sign challenge → link wallet → claim page ──────────────
  const handleSign = async (
    connection: WalletConnection,
    signChainType: WalletChainType,
  ) => {
    setStep({ kind: "signature", connection, chainType: signChainType, pending: true, error: null });
    // Which call failed decides the copy: a link error and a claim error
    // are different problems with different fixes.
    let phase: "link" | "claim" = "link";
    try {
      // 3a–3c. Nonce → signature → link, via the shared flow. The bundle
      // carries the chain's `extra` (e.g. Cosmos {pub_key, chain_id}),
      // which is the only place the verifier reads the key from.
      const linked = await signLinkChallenge(target.chain_slug, signChainType, connection);
      // A wallet already linked to THIS account (a re-run, or a retry after
      // the link succeeded and the claim failed) is not an error. A wallet
      // linked to ANOTHER account surfaces as bcc_conflict here.
      await linkOrConfirmOwnWallet(target.chain_slug, linked);

      // 3d. Claim the page now that the wallet is verified.
      phase = "claim";
      await claimPage({
        id:          pageId,
        entity_type: target.entity_type,
        entity_id:   target.entity_id,
      });

      captureAnalyticsEvent("claim_completed", { chain: target.chain_slug });
      setStep({ kind: "confirmation" });
    } catch (err) {
      setStep({
        kind: "signature",
        connection,
        chainType: signChainType,
        pending: false,
        error: phase === "link" ? humanizeLinkStepError(err) : humanizeClaimStepError(err),
      });
    }
  };

  const handleClose = () => {
    if (step.kind === "confirmation") {
      router.refresh();
    }
    onClose();
  };

  return (
    <Dialog title="Claim this validator" onClose={handleClose} panelClassName="max-w-lg">
      {step.kind === "explanation" && (
        <ExplanationStep
          pageName={pageName}
          chainSlug={target.chain_slug}
          onContinue={() => { void handleConnect(); }}
          onCancel={handleClose}
        />
      )}

      {step.kind === "connect" && (
        <ConnectStep
          chainSlug={target.chain_slug}
          walletName={claimable ? walletNameFor(chainType) : "your wallet"}
          claimable={claimable}
          pending={step.pending}
          error={step.error}
          onRetry={() => { void handleConnect(); }}
          onCancel={handleClose}
        />
      )}

      {step.kind === "signature" && (
        <SignatureStep
          pageName={pageName}
          walletName={walletNameFor(step.chainType)}
          connection={step.connection}
          pending={step.pending}
          error={step.error}
          onSign={() => { void handleSign(step.connection, step.chainType); }}
          onCancel={handleClose}
        />
      )}

      {step.kind === "confirmation" && (
        <ConfirmationStep
          pageName={pageName}
          handle={null}
          onClose={handleClose}
        />
      )}
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 1 — Explanation
// ─────────────────────────────────────────────────────────────────────

function ExplanationStep({
  pageName,
  chainSlug,
  onContinue,
  onCancel,
}: {
  pageName: string;
  chainSlug: string;
  onContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h3 className="bcc-stencil text-2xl text-bcc-text">
        Are you the operator of {pageName}?
      </h3>
      <p className="mt-3 font-serif text-bcc-text-secondary">
        Claiming a validator page proves you control its on-chain keys.
        Once it&apos;s yours, you can publish announcements on it.
      </p>
      <p className="bcc-mono mt-4 text-[11px] text-bcc-text-secondary">
        Chain: {chainSlug.toUpperCase()} · Signature only — no transaction, no fees.
      </p>
      <ButtonRow>
        <SecondaryButton onClick={onCancel}>CANCEL</SecondaryButton>
        <PrimaryButton onClick={onContinue}>I AM THE OPERATOR →</PrimaryButton>
      </ButtonRow>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 2 — Connect wallet
// ─────────────────────────────────────────────────────────────────────

function ConnectStep({
  chainSlug,
  walletName,
  claimable,
  pending,
  error,
  onRetry,
  onCancel,
}: {
  chainSlug: string;
  walletName: string;
  claimable: boolean;
  pending: boolean;
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
}) {
  // ⛔ An unsupported chain gets the explanation and a way out — never a
  // retry button, which could only fail again for the same reason.
  if (!claimable) {
    return (
      <>
        <h3 className="bcc-stencil text-2xl text-bcc-text">
          Claiming isn&apos;t available here
        </h3>
        {error !== null && <ErrorLine message={error} />}
        <ButtonRow>
          <SecondaryButton onClick={onCancel}>CLOSE</SecondaryButton>
        </ButtonRow>
      </>
    );
  }

  return (
    <>
      <h3 className="bcc-stencil text-2xl text-bcc-text">Connect your wallet</h3>
      <p className="mt-3 font-serif text-bcc-text-secondary">
        Open {walletName} and approve the connection request for{" "}
        <span className="bcc-mono text-bcc-text">{chainSlug.toUpperCase()}</span>.
        We&apos;ll read your wallet&apos;s public address — nothing else.
      </p>
      {error !== null && <ErrorLine message={error} />}
      <ButtonRow>
        <SecondaryButton onClick={onCancel}>CANCEL</SecondaryButton>
        <PrimaryButton onClick={onRetry} disabled={pending}>
          {pending ? "CONNECTING…" : error !== null ? "RETRY" : "CONNECT WALLET"}
        </PrimaryButton>
      </ButtonRow>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 3 — Sign challenge
// ─────────────────────────────────────────────────────────────────────

function SignatureStep({
  pageName,
  walletName,
  connection,
  pending,
  error,
  onSign,
  onCancel,
}: {
  pageName: string;
  walletName: string;
  connection: WalletConnection;
  pending: boolean;
  error: string | null;
  onSign: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h3 className="bcc-stencil text-2xl text-bcc-text">Sign the challenge</h3>
      <p className="mt-3 font-serif text-bcc-text-secondary">
        {walletName} will pop up with a plain-English message. Signing it
        proves you control{" "}
        <span className="bcc-mono break-all text-bcc-text">{connection.address}</span>.
        We match this address against {pageName}&apos;s on-chain operator key —
        if they match, the page is yours.
      </p>
      <p className="bcc-mono mt-4 text-[11px] text-bcc-text-secondary">
        Signing is free. No transaction is broadcast.
      </p>
      {error !== null && <ErrorLine message={error} />}
      <ButtonRow>
        <SecondaryButton onClick={onCancel}>CANCEL</SecondaryButton>
        <PrimaryButton onClick={onSign} disabled={pending}>
          {pending ? "SIGNING…" : error !== null ? "RETRY SIGNATURE" : "SIGN MESSAGE"}
        </PrimaryButton>
      </ButtonRow>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Step 4 — Confirmation
// ─────────────────────────────────────────────────────────────────────

function ConfirmationStep({
  pageName,
  handle,
  onClose,
}: {
  pageName: string;
  handle: string | null;
  onClose: () => void;
}) {
  return (
    <>
      <p
        className="bcc-mono text-[10px] tracking-[0.24em]"
        style={{ color: "var(--verified)" }}
      >
        ✓ VERIFIED
      </p>
      <h3 className="bcc-stencil mt-2 text-3xl text-bcc-text">
        {pageName} is yours.
      </h3>
      <p className="mt-3 font-serif text-bcc-text-secondary">
        Your claim is verified, and you can now publish announcements on
        this page.
      </p>
      <p className="bcc-mono mt-4 text-[11px] text-bcc-text-secondary">
        What&apos;s next:
      </p>
      <ul className="mt-2 space-y-1.5 font-serif text-bcc-text-secondary">
        <li>· Post your first announcement.</li>
        {handle !== null && <li>· Visit your profile at /u/{handle}.</li>}
      </ul>
      <ButtonRow>
        <PrimaryButton onClick={onClose}>BACK TO THE FLOOR</PrimaryButton>
      </ButtonRow>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Buttons
// ─────────────────────────────────────────────────────────────────────

function ButtonRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
      {children}
    </div>
  );
}

function PrimaryButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={
        "bcc-stencil rounded-sm px-5 py-2.5 text-[12px] tracking-[0.2em] transition " +
        (disabled
          ? "cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted"
          : "bg-ink text-cardstock hover:bg-blueprint")
      }
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bcc-mono rounded-sm px-4 py-2 text-[10px] tracking-[0.18em] text-bcc-text-secondary hover:text-bcc-text"
    >
      {children}
    </button>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="bcc-mono mt-3 text-[11px] text-bcc-text-error">
      {message}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Error humanizers
// ─────────────────────────────────────────────────────────────────────

/** Connect step: provider problems (wallet missing, chain unknown, user cancel). */
function humanizeWalletError(err: unknown): string {
  // dispatch.ts owns the per-provider copy (Keplr / MetaMask / Phantom /
  // Polkadot unavailable, user cancel, unsupported chain).
  return humanizeWalletProviderError(err) ?? "Couldn't reach your wallet. Try again.";
}

/** Nonce, signature and wallet link: proving you hold this wallet. */
function humanizeLinkStepError(err: unknown): string {
  const provider = humanizeWalletProviderError(err);
  if (provider !== null) return provider;
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in first.",
      // POST /auth/wallet-link answers a failed signature with 403
      // bcc_forbidden; bcc_signature_invalid is the login/signup code,
      // kept in case the route ever aligns.
      bcc_forbidden: "The wallet signature didn't verify. Try signing again.",
      bcc_signature_invalid: "The wallet signature didn't verify. Try signing again.",
      // Only reached when the wallet is NOT on this account's own list
      // (linkOrConfirmOwnWallet checked), so the wording can be definite.
      bcc_conflict:
        "This wallet is linked to a different BCC account. Sign in with that account to claim.",
      bcc_wallet_unverified:
        "This wallet is already on your account but isn't verified yet. Check it in Settings → Wallets.",
      bcc_invalid_request: "The signing request expired. Try signing again.",
      bcc_rate_limited: "Too many attempts — wait a minute and retry.",
    },
    "Couldn't verify the wallet. Try again.",
  );
}

/** Claim: the wallet is verified; this is about the page itself. */
function humanizeClaimStepError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in first.",
      bcc_precondition_failed: "Connect a wallet before claiming this page.",
      bcc_forbidden: "This wallet doesn't match the validator's operator address.",
      bcc_conflict: "This page is already claimed by another wallet.",
      bcc_rate_limited: "Too many attempts — wait a minute and retry.",
      bcc_not_found: "Page not found. Refresh and try again.",
      bcc_invalid_request: "Couldn't complete the claim. Try again.",
    },
    "Couldn't complete the claim. Try again.",
  );
}
