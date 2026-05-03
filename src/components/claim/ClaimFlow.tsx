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
 * V1 scope: Cosmos / Keplr only. EVM (MetaMask) and Solana (Phantom)
 * variants layer on later — the step machine + API surface is shared.
 *
 * Cache invalidation on success: the parent <EntityProfile> route is
 * a server component. We call `router.refresh()` so the next paint
 * re-fetches the card view-model with `is_claimed: true` and the
 * Wanted poster disappears.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { getWalletNonce, linkWallet } from "@/lib/api/auth-endpoints";
import { claimPage } from "@/lib/api/pages-endpoints";
import {
  BccApiError,
  type CardClaimTarget,
} from "@/lib/api/types";
import {
  connectKeplr,
  isCosmosChain,
  KeplrError,
  KeplrUnavailableError,
  KeplrUnsupportedChainError,
  signKeplrChallenge,
  type KeplrConnection,
} from "@/lib/wallet/keplr";

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
      connection: KeplrConnection;
      pending: boolean;
      error: string | null;
    }
  | { kind: "confirmation" };

export function ClaimFlow({ pageId, pageName, target, onClose }: ClaimFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: "explanation" });

  // ── Step 2: Connect Keplr ──────────────────────────────────────────
  const handleConnect = async () => {
    if (!isCosmosChain(target.chain_slug)) {
      setStep({
        kind: "connect",
        pending: false,
        error: `Chain "${target.chain_slug}" is not yet supported. Cosmos chains only for now.`,
      });
      return;
    }
    setStep({ kind: "connect", pending: true, error: null });
    try {
      const connection = await connectKeplr(target.chain_slug);
      setStep({ kind: "signature", connection, pending: false, error: null });
    } catch (err) {
      setStep({
        kind: "connect",
        pending: false,
        error: humanizeWalletError(err),
      });
    }
  };

  // ── Step 3: Sign challenge → link wallet → claim page ──────────────
  const handleSign = async (connection: KeplrConnection) => {
    setStep({ kind: "signature", connection, pending: true, error: null });
    try {
      // 3a. Server-issued nonce.
      const nonce = await getWalletNonce({
        chain_slug:     connection.chainSlug,
        wallet_address: connection.address,
      });

      // 3b. Sign the challenge in Keplr (ADR-036 signArbitrary).
      const signed = await signKeplrChallenge(
        connection.chainSlug,
        connection.address,
        nonce.message
      );

      // 3c. Verify + persist wallet link on the server.
      await linkWallet({
        wallet_address: connection.address,
        signature:      signed.signature,
        pub_key:        signed.pubKey,
        wallet_type:    "keplr",
      });

      // 3d. Claim the page now that the wallet is verified.
      await claimPage({
        id:          pageId,
        entity_type: target.entity_type,
        entity_id:   target.entity_id,
      });

      setStep({ kind: "confirmation" });
    } catch (err) {
      setStep({
        kind: "signature",
        connection,
        pending: false,
        error: humanizeError(err),
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
    <ModalShell title="Claim this validator" onClose={handleClose}>
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
          pending={step.pending}
          error={step.error}
          onRetry={() => { void handleConnect(); }}
          onCancel={handleClose}
        />
      )}

      {step.kind === "signature" && (
        <SignatureStep
          pageName={pageName}
          connection={step.connection}
          pending={step.pending}
          error={step.error}
          onSign={() => { void handleSign(step.connection); }}
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
    </ModalShell>
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
      <h3 className="bcc-stencil text-2xl text-ink">
        Are you the operator of {pageName}?
      </h3>
      <p className="mt-3 font-serif text-ink-soft">
        Claiming a validator page proves you control its on-chain keys.
        It unlocks three things:
      </p>
      <ul className="mt-3 space-y-2 font-serif text-ink-soft">
        <li>· Edit the bio your delegators see when they visit your page.</li>
        <li>· Post announcements in your validator&apos;s stream.</li>
        <li>· Earn the operator badge on every post you write here.</li>
      </ul>
      <p className="bcc-mono mt-4 text-[11px] text-cardstock-deep">
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
  pending,
  error,
  onRetry,
  onCancel,
}: {
  chainSlug: string;
  pending: boolean;
  error: string | null;
  onRetry: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h3 className="bcc-stencil text-2xl text-ink">Connect Keplr</h3>
      <p className="mt-3 font-serif text-ink-soft">
        Open Keplr and approve the connection request for{" "}
        <span className="bcc-mono text-ink">{chainSlug.toUpperCase()}</span>.
        We&apos;ll read your wallet&apos;s public address — nothing else.
      </p>
      {error !== null && <ErrorLine message={error} />}
      <ButtonRow>
        <SecondaryButton onClick={onCancel}>CANCEL</SecondaryButton>
        <PrimaryButton onClick={onRetry} disabled={pending}>
          {pending ? "CONNECTING…" : error !== null ? "RETRY KEPLR" : "OPEN KEPLR"}
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
  connection,
  pending,
  error,
  onSign,
  onCancel,
}: {
  pageName: string;
  connection: KeplrConnection;
  pending: boolean;
  error: string | null;
  onSign: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h3 className="bcc-stencil text-2xl text-ink">Sign the challenge</h3>
      <p className="mt-3 font-serif text-ink-soft">
        Keplr will pop up with a plain-English message. Signing it
        proves you control{" "}
        <span className="bcc-mono break-all text-ink">{connection.address}</span>.
        We match this address against {pageName}&apos;s on-chain operator key —
        if they match, the page is yours.
      </p>
      <p className="bcc-mono mt-4 text-[11px] text-cardstock-deep">
        Signing is free. No transaction is broadcast.
      </p>
      {error !== null && <ErrorLine message={error} />}
      <ButtonRow>
        <SecondaryButton onClick={onCancel}>CANCEL</SecondaryButton>
        <PrimaryButton onClick={onSign} disabled={pending}>
          {pending ? "SIGNING…" : error !== null ? "RETRY SIGNATURE" : "SIGN WITH KEPLR"}
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
      <h3 className="bcc-stencil mt-2 text-3xl text-ink">
        {pageName} is yours.
      </h3>
      <p className="mt-3 font-serif text-ink-soft">
        Your operator badge is live. The page&apos;s bio and stream
        unlocked the moment you signed.
      </p>
      <p className="bcc-mono mt-4 text-[11px] text-cardstock-deep">
        What&apos;s next:
      </p>
      <ul className="mt-2 space-y-1.5 font-serif text-ink-soft">
        <li>· Write a bio that tells your delegators who you are.</li>
        <li>· Post your first announcement in the stream.</li>
        {handle !== null && <li>· Visit your profile at /u/{handle}.</li>}
      </ul>
      <ButtonRow>
        <PrimaryButton onClick={onClose}>BACK TO THE FLOOR</PrimaryButton>
      </ButtonRow>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Modal shell + buttons
// ─────────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-4 backdrop-blur-sm md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bcc-panel relative w-full max-w-lg p-6 md:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="bcc-mono absolute right-4 top-4 text-[10px] tracking-[0.24em] text-cardstock-deep hover:text-ink"
        >
          ESC
        </button>
        {children}
      </div>
    </div>
  );
}

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
          ? "cursor-not-allowed bg-cardstock-deep/40 text-ink-soft/60"
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
      className="bcc-mono rounded-sm px-4 py-2 text-[10px] tracking-[0.18em] text-cardstock-deep hover:text-ink"
    >
      {children}
    </button>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="bcc-mono mt-3 text-[11px] text-safety">
      {message}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Error humanizers
// ─────────────────────────────────────────────────────────────────────

function humanizeWalletError(err: unknown): string {
  if (err instanceof KeplrUnavailableError) {
    return "Keplr is not installed. Install it from keplr.app, then retry.";
  }
  if (err instanceof KeplrUnsupportedChainError) {
    return `Chain "${err.slug}" isn't supported by the claim flow yet.`;
  }
  if (err instanceof KeplrError) {
    return err.message;
  }
  return "Couldn't connect to Keplr. Try again.";
}

function humanizeError(err: unknown): string {
  if (err instanceof KeplrError) {
    return humanizeWalletError(err);
  }
  if (err instanceof BccApiError) {
    switch (err.code) {
      case "bcc_unauthorized":
        return "Sign in first.";
      case "bcc_precondition_failed":
        return "Connect a wallet before claiming this page.";
      case "bcc_forbidden":
        return "This wallet doesn't match the validator's operator address.";
      case "bcc_conflict":
        return "This page is already claimed by another wallet.";
      case "bcc_signature_invalid":
        return "Signature didn't verify. Try signing again.";
      case "bcc_rate_limited":
        return "Too many attempts — wait a minute and retry.";
      case "bcc_not_found":
        return "Page not found. Refresh and try again.";
      default:
        return err.message || "Couldn't complete the claim. Try again.";
    }
  }
  return "Something went wrong. Try again.";
}
