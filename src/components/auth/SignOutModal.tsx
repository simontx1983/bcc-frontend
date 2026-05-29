"use client";

import { signOut } from "next-auth/react";
import { useState } from "react";

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
    <>
      {/* Scrim */}
      <div
        className="bcc-signout-scrim"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="bcc-signout-modal" role="dialog" aria-modal="true" aria-labelledby="signout-title">
        <div className="bcc-signout-blur-layer" />

        <div className="bcc-signout-content">
          <h2 className="bcc-signout-title" id="signout-title">Sign out</h2>
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
      </div>
    </>
  );
}