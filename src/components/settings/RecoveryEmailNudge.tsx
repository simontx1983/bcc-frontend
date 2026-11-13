"use client";

/**
 * F-332 (D): a gentle, persistent one-line nudge for a member whose account
 * has no recovery email (a wallet-only account), pointing at Settings →
 * Account where the add-a-recovery-email form lives.
 *
 * Self-contained so any surface can place it (Settings, and the own-profile
 * layout): it reads GET /wallets itself and renders NOTHING unless the
 * server says `recovery.has_recovery_email === false`. While loading, on a
 * failed read, or once a recovery email exists, there is no nudge — a
 * missing nudge is harmless, a wrong one is noise.
 *
 * Copy is factual and calm (cadence-pressure policy): no counts, no
 * "you haven't", no urgency. Not dismissible-forever — losing the only
 * wallet would lock the account — but it is one line, not modal, and it
 * goes away the moment the email is confirmed.
 */

import type { Route } from "next";
import Link from "next/link";

import { useMyWallets } from "@/hooks/useWallets";

/** Settings → Account, where the RecoveryEmailPanel form is. */
export const RECOVERY_EMAIL_SETTINGS_HREF = "/u/me?tab=account" as Route;

export function RecoveryEmailNudge({
  /**
   * Where "Add recovery email" goes. Defaults to Settings → Account; on
   * the Account tab itself, pass the in-page anchor of the wallets
   * section, where the form is.
   */
  href = RECOVERY_EMAIL_SETTINGS_HREF,
  /** Hide the link entirely (a surface that already shows the form). */
  showLink = true,
}: {
  href?: string;
  showLink?: boolean;
}) {
  const wallets = useMyWallets();
  if (wallets.data?.recovery?.has_recovery_email !== false) return null;

  return (
    <aside
      aria-label="Account recovery"
      className="bcc-panel flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3"
    >
      <p className="font-serif text-sm text-bcc-text">
        Add a recovery email so you can get back in if you lose access to your wallet.
      </p>
      {showLink && (
        <Link
          href={href as Route}
          className="bcc-mono inline-flex min-h-[44px] items-center text-[11px] tracking-[0.14em] text-bcc-text underline underline-offset-2"
        >
          Add recovery email
        </Link>
      )}
    </aside>
  );
}
