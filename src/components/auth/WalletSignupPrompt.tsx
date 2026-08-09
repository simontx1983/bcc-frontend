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
 * Accessibility: supplied by the shared `Dialog` primitive —
 * role="dialog" + aria-modal, portal, canonical z-band, focus trap,
 * focus entry and return, body scroll lock, and Escape + backdrop
 * dismissal. (The scroll lock this comment used to promise was never
 * actually implemented; Dialog now delivers it.)
 *
 * Initial focus still lands on the handle input: `bare` means Dialog
 * renders no corner close button, so that input remains the panel's
 * first focusable and Dialog's focus-on-open picks it.
 */

import { useState } from "react";

import { Dialog } from "@/components/ui/Dialog";
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
  const [handle, setHandle] = useState(props.initialHandle ?? "");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");

  const handleErrorKind = checkHandleLocal(handle);
  const handleValid = handleErrorKind === null && handle.length >= 3;
  const handleHint = formatHandleHint(handle, handleErrorKind);

  return (
    // `bare` so the existing bcc-panel shell, its p-8 padding and the
    // absence of a corner close control all survive untouched — and so
    // the handle input stays the first focusable. The backdrop keeps its
    // original 60% tint with no blur; Dialog's default would add both a
    // heavier tint and backdrop-blur-sm that this surface never had.
    <Dialog
      title="Create an account for this wallet"
      onClose={props.onDismiss}
      center
      bare
      backdropClassName="bg-ink/60"
      panelClassName="bcc-panel max-w-md p-8"
    >
      <h2 className="bcc-stencil text-2xl text-bcc-text">
        Create an account for this wallet
      </h2>
      <p className="mt-2 font-serif text-bcc-text-secondary">
        No BCC account is linked to that wallet yet. Pick a handle and we&apos;ll
        mint one — your wallet stays the credential.
      </p>

      <div className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="bcc-mono text-bcc-text-secondary">Handle</span>
          <div className="flex items-center border border-bcc-input-border bg-bcc-input-bg focus-within:border-bcc-accent focus-within:ring-1 focus-within:ring-bcc-accent">
            <span className="bcc-mono pl-3 text-bcc-text-secondary">@</span>
            <input
              type="text"
              required
              minLength={3}
              maxLength={20}
              autoComplete="username"
              pattern="[a-z0-9\-]{3,20}"
              value={handle}
              onChange={(e) => setHandle(e.target.value.toLowerCase())}
              className="flex-1 bg-transparent px-2 py-2 font-serif text-bcc-text outline-none"
            />
          </div>
          <span
            className={`bcc-mono ${handleValid ? "text-bcc-text-secondary/70" : "text-safety"}`}
            role={handleValid ? undefined : "alert"}
            aria-live="polite"
          >
            {handleHint}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="bcc-mono text-bcc-text-secondary">Display name (optional)</span>
          <input
            type="text"
            maxLength={60}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="border border-bcc-input-border bg-bcc-input-bg px-3 py-2 font-serif text-bcc-text outline-none focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="bcc-mono text-bcc-text-secondary">Email (optional)</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-bcc-input-border bg-bcc-input-bg px-3 py-2 font-serif text-bcc-text outline-none focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent"
          />
          <span className="bcc-mono text-bcc-text-secondary/70">
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
          className="bcc-mono py-2 text-bcc-text-secondary underline"
        >
          Cancel
        </button>
      </div>
    </Dialog>
  );
}
