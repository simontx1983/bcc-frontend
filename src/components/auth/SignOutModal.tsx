"use client";

/**
 * SignOutModal — sign-out confirmation.
 *
 * Shell: the shared `Dialog` primitive in `bare` mode. It previously
 * hand-rolled its own scrim + fixed centered panel with no portal, focus
 * trap, focus entry/return, scroll lock or Escape. `bare` buys all of
 * those while leaving the `.bcc-signout-*` chrome — the glass blur layer,
 * the 24px radius, the 32/28/24 content padding — exactly as it was.
 *
 * Dialog now owns placement, so `.bcc-signout-modal` keeps only its
 * appearance rules; its fixed-position centering was deleted.
 *
 * Dismissal deliberately stays unguarded while `pending`, matching the
 * original: sign-out is a single idempotent call with no follow-on step,
 * and both buttons are already disabled — so guarding the scrim too
 * would leave no exit at all if the request hung.
 */

import { signOut } from "next-auth/react";
import { useState } from "react";

import { Dialog } from "@/components/ui/Dialog";

interface SignOutModalProps {
  onClose: () => void;
}

export function SignOutModal({ onClose }: SignOutModalProps) {
  const [pending, setPending] = useState(false);

  async function handleSignOut() {
    setPending(true);
    await signOut({ redirect: false, callbackUrl: "/" });
    onClose();
  }

  return (
    // Backdrop reproduces the old `.bcc-signout-scrim` exactly:
    // rgba(0,0,0,0.55), no blur. `bg-ink/55` would NOT match — `--ink` is
    // #0f0d09, a warm near-black — so the fixed true-black alias is used.
    <Dialog
      title="Sign out"
      onClose={onClose}
      center
      bare
      backdropClassName="bg-bcc-black/55"
      panelClassName="bcc-signout-modal"
    >
      <div className="bcc-signout-blur-layer" />

      <div className="bcc-signout-content">
        <h2 className="bcc-signout-title">Sign out</h2>
        <p className="bcc-signout-body">Are you sure you want to sign out?</p>

        <div className="bcc-signout-actions">
          <button
            type="button"
            onClick={() => { void handleSignOut(); }}
            disabled={pending}
            className="bcc-auth-submit"
            style={{ flex: 1 }}
          >
            {pending ? "Signing out…" : "Sign out"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="bcc-auth-submit bcc-auth-submit--outline"
            style={{ flex: 1 }}
          >
            Cancel
          </button>
        </div>
      </div>
    </Dialog>
  );
}