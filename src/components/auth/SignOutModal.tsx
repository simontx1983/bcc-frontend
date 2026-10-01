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
 *
 * ## What changed with the session boundary
 *
 * This used to call `signOut({ redirect: false })` and then close. That
 * cleared the cookie and nothing else: no navigation, so the RSC tree
 * never re-ran and server-rendered owner controls stayed on screen; and
 * no cache clear, so every cached private payload survived into the next
 * viewer's session in the same tab.
 *
 * It now goes through `endSession("user")`, which cancels and clears the
 * query cache, purges viewer-scoped storage, revokes this device's push
 * subscription (bounded), and only then signs out WITH a redirect.
 *
 * Two outcomes are reported honestly rather than assumed:
 *
 *   - If the sign-out call itself fails, local private data is already
 *     gone — the teardown does that first, on purpose — but the server
 *     session may still exist. The user is told exactly that and given a
 *     reload, instead of a button stuck on "Signing out…" forever.
 *   - If the browser refused to unsubscribe from push, we say so. We do
 *     not claim a device is clean when it may still receive the previous
 *     account's notifications.
 */

import { useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
import {
  endSession,
  pushCleanupNeedsWarning,
} from "@/lib/auth/session-boundary";

interface SignOutModalProps {
  onClose: () => void;
}

type Phase =
  | { kind: "idle" }
  | { kind: "pending" }
  /**
   * The server was not reachable (or did not answer inside the budget).
   * Private content is already hidden — the render gate closed before any
   * of this — but the session may still exist server-side.
   */
  | {
      kind: "incomplete";
      pushWarning: boolean;
      /** False when browser storage could not be fully purged. */
      storageCleared: boolean;
      timedOut: boolean;
    };

export function SignOutModal({ onClose }: SignOutModalProps) {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const pending = phase.kind === "pending";

  async function handleSignOut() {
    setPhase({ kind: "pending" });
    try {
      const result = await endSession("user");
      if (result.signedOut) {
        // A successful sign-out navigates, so this component is usually
        // gone before the next line. Closing is the no-navigation
        // fallback and is harmless either way.
        onClose();
        return;
      }
      setPhase({
        kind: "incomplete",
        pushWarning: pushCleanupNeedsWarning(result.pushCleanup),
        storageCleared: result.storagePurge === "cleared",
        timedOut: result.signOutTimedOut,
      });
    } catch {
      // endSession does not throw, and the sign-out step is bounded — but
      // a caller must never be strandable on "Signing out…" because
      // something unexpected did.
      setPhase({
        kind: "incomplete",
        pushWarning: false,
        storageCleared: false,
        timedOut: false,
      });
    }
  }

  if (phase.kind === "incomplete") {
    return (
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
          <h2 className="bcc-signout-title">Almost signed out</h2>
          <p role="alert" className="bcc-signout-body">
            {/* Says only what is true. The render gate has hidden private
                content either way, but DELETION cannot be promised when a
                storage access throws — private mode and blocked site data
                both do that — so the claim is conditional on the purge
                result rather than asserted. */}
            {phase.storageCleared
              ? "Private data on this device has been hidden and cleared"
              : "Private data on this device has been hidden, though some of it could not be deleted"}
            {phase.timedOut
              ? ", but the server didn’t respond in time to finish signing out."
              : ", but we couldn’t reach the server to finish signing out."}{" "}
            Use the button below to finish.
            {phase.pushWarning
              ? " Push notifications may also still be enabled on this device."
              : ""}
          </p>
          <div className="bcc-signout-actions">
            <button
              type="button"
              onClick={() => {
                // A full navigation to NextAuth's own sign-out route. A
                // bare reload of the current page would re-render it with
                // the session cookie still in place; this completes the
                // sign-out server-side without needing our fetch to work.
                window.location.assign("/api/auth/signout");
              }}
              className="bcc-auth-submit"
              style={{ flex: 1 }}
            >
              Finish signing out
            </button>
            <button
              type="button"
              onClick={onClose}
              className="bcc-auth-submit bcc-auth-submit--outline"
              style={{ flex: 1 }}
            >
              Close
            </button>
          </div>
        </div>
      </Dialog>
    );
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
