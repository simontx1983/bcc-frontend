"use client";

/**
 * F-332 (D): a gentle, persistent one-line nudge for a member whose account
 * has no recovery email (a wallet-only account), pointing at Settings →
 * Account where the add-a-recovery-email form lives.
 *
 * Mounted in the own-profile header (owner only). Not on Settings →
 * Account: WalletsSection already shows the ACCOUNT RECOVERY banner there.
 * Self-contained: it reads GET /wallets itself and renders NOTHING unless the
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
   * Where "Add recovery email" goes. Defaults to Settings → Account; the
   * profile page passes its own handle's Account tab (no /u/me hop).
   */
  href = RECOVERY_EMAIL_SETTINGS_HREF,
  /** Spacing from the surface that places it. */
  className,
}: {
  href?: Route;
  className?: string;
}) {
  const wallets = useMyWallets();
  if (wallets.data?.recovery?.has_recovery_email !== false) return null;

  return (
    <aside
      aria-label="Account recovery"
      className={
        "bcc-panel flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3" +
        (className !== undefined ? ` ${className}` : "")
      }
    >
      <p className="font-serif text-sm text-bcc-text">
        Add a recovery email so you can get back in if you lose access to your wallet.
      </p>
      <Link
        href={href}
        className="bcc-mono inline-flex min-h-[44px] items-center text-[11px] tracking-[0.14em] text-bcc-text underline underline-offset-2"
      >
        Add recovery email
      </Link>
    </aside>
  );
}
