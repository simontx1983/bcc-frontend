"use client";

/**
 * WalletSignupPrompt — modal opened from /login when wallet sign-in
 * lands on `bcc_wallet_not_linked` (no BCC account is bound to that
 * wallet yet). Lets the user pick a handle, optionally a display name
 * and email, then complete a wallet-signup IN PLACE without bouncing
 * to /signup and re-doing the wallet connect dance.
 *
 * UX rationale: bouncing the user from /login → /signup loses both
 * the chain selection they just made and the muscle memory of "I'm
 * signing in." A modal keeps them on the same surface, frames the
 * decision as "create an account for this wallet?" rather than
 * "go fill out a form somewhere else."
 *
 * The actual signing happens in <WalletAuthButton mode="signup">,
 * which:
 *   1. Issues a fresh /auth/wallet-nonce (the original was consumed
 *      by the failed /auth/wallet-login and can't be replayed).
 *   2. Asks Keplr to sign the new challenge.
 *   3. POSTs to /auth/wallet-signup with handle + signature → creates
 *      the account.
 *   4. Issues a SECOND fresh nonce + sign cycle to bridge into the
 *      NextAuth session via /auth/wallet-login.
 *
 * That's two Keplr prompts on top of the original failed sign-in
 * (so three total in the worst case). It's the honest cost of doing
 * wallet-as-credential auth without a session-bridging shortcut.
 *
 * Accessibility:
 *   - role="dialog" + aria-modal + aria-labelledby on the title.
 *   - Initial focus moves to the handle input on open.
 *   - Escape and backdrop click both dismiss.
 *   - Body scroll locked while open so background content doesn't
 *     scroll behind a captured-pointer modal.
 */

import { useEffect, useId, useRef, useState } from "react";

import { WalletAuthButton } from "@/components/auth/WalletAuthButton";
import { checkHandleLocal, formatHandleHint } from "@/lib/auth/handleValidation";

export interface WalletSignupPromptProps {
  /** Pre-fill the handle input (e.g. if the parent already collected one). Optional. */
  initialHandle?: string;
  /** Called after the new account is created AND signed in. Parent typically router.replace()s. */
  onSuccess: () => void;
  /** Called when the user dismisses without completing. Parent should clear its open-state. */
  onDismiss: () => void;
}

export function WalletSignupPrompt(props: WalletSignupPromptProps) {
  const titleId = useId();
  const handleInputRef = useRef<HTMLInputElement | null>(null);

  const [handle, setHandle] = useState(props.initialHandle ?? "");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  const handleErrorKind = checkHandleLocal(handle);
  const handleValid = handleErrorKind === null && handle.length >= 3;
  const handleHint = formatHandleHint(handle, handleErrorKind);

  // Initial focus on the handle input. Project convention is no body
  // scroll lock — the other six modals in this codebase (Composer,
  // ClaimFlow, OpenDisputeModal, PanelVoteModal, EligibleCommunitiesModal,
  // ReportButton) all skip the lock. Match that until we decide to
  // change the project-wide standard.
  useEffect(() => {
    handleInputRef.current?.focus();
  }, []);

  // Escape to dismiss. Pin onDismiss in a ref so the listener can bind
  // once at mount with `[]` deps — without this, the parent passing an
  // inline arrow makes `props` a new identity every render, churning
  // the listener on every keystroke. Ref pattern keeps the listener
  // stable while still calling the latest callback.
  const dismissRef = useRef(props.onDismiss);
  dismissRef.current = props.onDismiss;
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismissRef.current();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <div
      role="presentation"
      onClick={(event) => {
        // Backdrop click dismisses; clicks inside the panel are caught
        // by the inner stopPropagation below so this only fires on the
        // backdrop itself.
        if (event.target === event.currentTarget) {
          props.onDismiss();
        }
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 px-4 py-10"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => {
          event.stopPropagation();
        }}
        className="bcc-panel w-full max-w-md p-8"
      >
        <h2 id={titleId} className="bcc-stencil text-2xl text-ink">
          Create an account for this wallet
        </h2>
        <p className="mt-2 font-serif text-ink-soft">
          No BCC account is linked to that wallet yet. Pick a handle and we&apos;ll
          mint one — your wallet stays the credential.
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="bcc-mono text-ink-soft">Handle</span>
            <div className="flex items-center border border-cardstock-edge bg-cardstock-deep/60 focus-within:border-blueprint focus-within:ring-1 focus-within:ring-blueprint">
              <span className="bcc-mono pl-3 text-ink-soft">@</span>
              <input
                ref={handleInputRef}
                type="text"
                required
                minLength={3}
                maxLength={20}
                autoComplete="username"
                pattern="[a-z0-9\-]{3,20}"
                value={handle}
                onChange={(e) => setHandle(e.target.value.toLowerCase())}
                className="flex-1 bg-transparent px-2 py-2 font-serif text-ink outline-none"
              />
            </div>
            <span
              className={`bcc-mono ${handleValid ? "text-ink-soft/70" : "text-safety"}`}
              role={handleValid ? undefined : "alert"}
              aria-live="polite"
            >
              {handleHint}
            </span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="bcc-mono text-ink-soft">Display name (optional)</span>
            <input
              type="text"
              maxLength={60}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="bcc-mono text-ink-soft">Email (optional)</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border border-cardstock-edge bg-cardstock-deep/60 px-3 py-2 font-serif text-ink outline-none focus:border-blueprint focus:ring-1 focus:ring-blueprint"
            />
            <span className="bcc-mono text-ink-soft/70">
              Skipped? We mint a placeholder so password recovery still works if
              you add one later.
            </span>
          </label>

          {/* WalletAuthButton owns the chain selector + the sign-and-post
              cycle. Disabled until the handle clears local validation —
              don't burn a Keplr signature on a request the server will
              reject anyway. */}
          <WalletAuthButton
            mode="signup"
            handle={handle}
            disabled={!handleValid}
            {...(displayName.trim() !== "" ? { displayName } : {})}
            {...(email.trim() !== "" ? { email } : {})}
            onSuccess={props.onSuccess}
          />

          <button
            type="button"
            onClick={props.onDismiss}
            className="bcc-mono py-2 text-ink-soft underline"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
