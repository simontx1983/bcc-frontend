"use client";

/**
 * WalletOwnershipPrompt — "is this wallet yours?" right after a viewer
 * proves their email (bcc-trust #398).
 *
 * An account created by someone else's wallet signup with the viewer's
 * address keeps that wallet linked even after the real owner verifies
 * the email, so it could still wallet-login. The verify response carries
 * `linked_wallet_count`; when it is > 0 the verify page shows this step
 * before onboarding. It is advisory: nothing happens unless the viewer
 * chooses to remove a wallet, and "these are mine" just continues.
 *
 * Reuses the Settings → Wallets pieces rather than a parallel flow: the
 * owner-only `useMyWallets` list, `useUnlinkWallet` (which stores the
 * replacement bearer a removal returns), `ConfirmDialog`, and the same
 * code-keyed unlink error copy. Wallets stay reviewable in Settings
 * afterwards, so a failed load never blocks the viewer.
 */

import { useState } from "react";

import { AuthCard } from "@/components/auth/AuthCard";
import {
  SessionWriteFailedNotice,
  UNLINK_SESSION_UNCERTAIN,
} from "@/components/auth/SessionWriteFailedNotice";
import { humanizeUnlinkError } from "@/components/settings/WalletsSection";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useMyWallets, useUnlinkWallet } from "@/hooks/useWallets";

export interface WalletOwnershipPromptProps {
  /** Continue to onboarding. */
  onDone: () => void;
}

export function WalletOwnershipPrompt({ onDone }: WalletOwnershipPromptProps) {
  const wallets = useMyWallets();
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [removedCount, setRemovedCount] = useState(0);
  const [sessionDoubt, setSessionDoubt] = useState(false);

  const unlink = useUnlinkWallet({
    onSuccess: (outcome) => {
      setConfirmingId(null);
      setErrorText(null);
      setRemovedCount((n) => n + 1);
      if (outcome.sessionRestored === false) setSessionDoubt(true);
    },
    // Keep the dialog open on failure, with the reason and a retry.
    onError: (err) => {
      setErrorText(humanizeUnlinkError(err));
    },
  });

  const items = wallets.data?.items ?? [];
  const confirming =
    confirmingId === null ? undefined : items.find((w) => w.id === confirmingId);

  const continueButton = (label: string) => (
    <button type="button" className="bcc-auth-submit" onClick={onDone}>
      {label}
    </button>
  );

  if (wallets.isPending) {
    return (
      <AuthCard heading="Email verified" subheading="Checking the wallets linked to this account…">
        <p className="bcc-auth-hint" style={{ textAlign: "center", padding: "8px 0" }}>
          Just a moment…
        </p>
      </AuthCard>
    );
  }

  if (wallets.isError) {
    return (
      <AuthCard
        heading="Email verified"
        subheading="We couldn't load the wallets linked to this account. You can review them any time in Settings → Wallets."
      >
        {continueButton("Continue")}
      </AuthCard>
    );
  }

  if (items.length === 0) {
    return (
      <AuthCard
        heading="Email verified"
        subheading={
          removedCount > 0
            ? "No wallets are linked to this account now."
            : "No wallets are linked to this account."
        }
      >
        {sessionDoubt && <SessionWriteFailedNotice message={UNLINK_SESSION_UNCERTAIN} />}
        {continueButton("Continue")}
      </AuthCard>
    );
  }

  const several = items.length > 1;

  return (
    <AuthCard
      heading={several ? "Are these wallets yours?" : "Is this wallet yours?"}
      subheading={
        several
          ? "This account has wallets linked. Remove any you don't recognise, so they can't be used to sign in to your account."
          : "This account has a wallet linked. If you don't recognise it, remove it, so it can't be used to sign in to your account."
      }
    >
      {sessionDoubt && <SessionWriteFailedNotice message={UNLINK_SESSION_UNCERTAIN} />}
      <ul className="flex flex-col gap-2" aria-label="Linked wallets">
        {items.map((w) => {
          const chainLabel = w.chain_name || w.chain_slug;
          return (
            <li
              key={w.id}
              className="flex flex-wrap items-center justify-between gap-3 border border-bcc-border bg-bcc-surface-hover p-3"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <span className="bcc-stencil text-sm uppercase text-bcc-text">{chainLabel}</span>
                <code className="bcc-mono block max-w-full truncate text-[11px] text-bcc-text-secondary">
                  {w.wallet_address}
                </code>
              </div>
              <button
                type="button"
                className="bcc-mono shrink-0 border border-bcc-border px-2 py-1.5 text-[11px] tracking-[0.14em] text-bcc-text-secondary hover:text-bcc-text"
                aria-label={`Not mine: remove the ${chainLabel} wallet`}
                onClick={() => {
                  unlink.reset();
                  setErrorText(null);
                  setConfirmingId(w.id);
                }}
              >
                NOT MINE
              </button>
            </li>
          );
        })}
      </ul>

      <div style={{ marginTop: 16 }}>
        {continueButton(several ? "They're all mine. Continue" : "It's mine. Continue")}
      </div>

      {confirming !== undefined && (
        <ConfirmDialog
          title="Remove this wallet?"
          body={`The ${confirming.chain_name || confirming.chain_slug} wallet will be unlinked from your account and can no longer be used to sign in to it.`}
          confirmLabel="Remove wallet"
          cancelLabel="Keep wallet"
          retryLabel="Try again"
          errorMessage={errorText}
          pending={unlink.isPending}
          onConfirm={() => {
            setErrorText(null);
            unlink.mutate(confirming.id);
          }}
          onCancel={() => {
            setConfirmingId(null);
            setErrorText(null);
          }}
        />
      )}
    </AuthCard>
  );
}
