"use client";

/**
 * SessionWriteFailedNotice — shown when an action succeeded on the
 * server and returned a replacement bearer, but writing it into this
 * device's session failed (`updateSessionBearer` returned false).
 *
 * The action stands; only this device's sign-in is in doubt. The control
 * is a BUTTON that ends the session through the session boundary, not a
 * /login link: the cookie survives in this state, and login/page.tsx
 * bounces any visitor with a session cookie straight back to the feed
 * (see the password and email cards in AccountSection, which this
 * mirrors). Ending the session also clears this device's cached private
 * data, which is right after a credential rotation.
 */

import { endSession } from "@/lib/auth/session-boundary";

export function SessionWriteFailedNotice({ message }: { message: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p role="status" className="bcc-mono text-[11px] text-bcc-text-secondary">
        {message}
      </p>
      <button
        type="button"
        onClick={() => {
          void endSession("user", { callbackUrl: "/login" });
        }}
        className="bcc-auth-submit inline-flex w-fit items-center justify-center"
      >
        Sign in again
      </button>
    </div>
  );
}

/**
 * After a recovery-email confirm: the server revoked the old bearer, so a
 * failed session write means this device really is signed out.
 */
export const RECOVERY_EMAIL_SESSION_LOST =
  "We couldn't keep this device signed in, so you'll need to sign in again.";

/**
 * After a wallet unlink. Revoking the old bearer is behind a server switch
 * (bcc_unlink_revokes_sessions), so a failed write does NOT always end
 * this device's session. The copy says what is known, not more.
 */
export const UNLINK_SESSION_UNCERTAIN =
  "The wallet was removed, but we couldn't refresh this device's sign-in. If you're asked to sign in again, that's why.";
