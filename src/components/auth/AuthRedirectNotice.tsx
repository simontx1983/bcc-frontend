"use client";

/**
 * AuthRedirectNotice — the toast an already-authenticated visitor sees
 * after being bounced off /login, /signup, or /forgot-password (see each
 * route's server-component guard). Those guards redirect to
 * `/?authNotice=<source>`; this component reads that param once, shows a
 * short-lived dismissible toast explaining why they landed here instead
 * of the page they clicked, then scrubs the param off the URL so a
 * refresh doesn't re-show it.
 *
 * Mounted once in AppShell so it fires regardless of which app page the
 * guard's redirect target happens to be (currently always "/").
 *
 * It is also the vehicle for carrying a sign-out explanation ACROSS the
 * teardown navigation. A boundary that ends in a document load destroys
 * any in-page message, so `endSession` appends an `authNotice` slug to the
 * callbackUrl and this component renders the matching canned copy once,
 * then scrubs the param. Bounded by the same 7s auto-dismiss as the rest,
 * and non-sensitive by construction: a slug indexes copy held here, so no
 * viewer data and no failure detail travel in the URL.
 */

import type { Route } from "next";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const AUTO_DISMISS_MS = 7000;

const COPY: Record<string, string> = {
  // Carried through the sign-out navigation by lib/auth/session-boundary.
  // Slugs only — the copy lives here, so nothing about the viewer or the
  // failure crosses the URL.
  "signed-out":
    "Your session ended, so you've been signed out. Sign in again to pick up where you left off.",
  standing:
    "You've been signed out because your account is under review. Sign in again to see the details.",
  "push-cleanup":
    "You're signed out. We couldn't switch off push notifications on this device, so you may still receive some — turn them off in your browser settings if you're sharing it.",
  // After a password change whose session update failed. The viewer's next
  // move depends on knowing the change DID land, so this must not be
  // replaced by the generic "signed-out" copy when an involuntary teardown
  // wins the race (see setPendingAuthNotice in lib/auth/session-boundary).
  "password-changed":
    "Your password was changed. We couldn't keep this device signed in, so sign in again using your NEW password.",
  login: "You're already signed in — no need to log in again.",
  signup: "You're already a member and signed in — no need to sign up again.",
  "forgot-password":
    "You're already signed in, so there's nothing to reset. Sign out first if you meant to change your password.",
};

/**
 * Appended to whatever reason the viewer is given. Says only what is true:
 * the unsubscribe was attempted and refused, so the previous account may
 * still be reachable on this device.
 */
const PUSH_CAVEAT =
  " We also couldn't switch off push notifications on this device, so you may still receive some — turn them off in your browser settings if you're sharing it.";

function AuthRedirectNoticeInner() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const source = searchParams.get("authNotice");
  // A separate flag rather than a slug of its own: the push caveat has to
  // be able to accompany ANY reason, and while both competed for the
  // single `authNotice` slug an explicit notice silently dropped it.
  const pushCaveat = searchParams.get("authNoticePush") === "1";

  const [message] = useState<string | null>(() => {
    // `Object.hasOwn`, not a bare index: `COPY["__proto__"]` resolves to
    // Object.prototype, which React then throws on ("Objects are not
    // valid as a React child"), and `?authNotice=constructor` /
    // `=toString` resolve to functions. There is no segment error
    // boundary, so that replaced the whole page with the global error UI
    // — and this component is mounted in the shared layouts, which
    // includes the ANONYMOUS site root.
    const base =
      source !== null && Object.hasOwn(COPY, source) ? COPY[source]! : null;
    if (!pushCaveat) {
      return base;
    }
    return base === null ? PUSH_CAVEAT.trim() : `${base}${PUSH_CAVEAT}`;
  });
  const [dismissed, setDismissed] = useState(false);

  // Scrub the param off the URL on mount so a refresh doesn't re-trigger
  // this — the notice is a one-time "here's why you landed here", not a
  // persistent state of the page.
  useEffect(() => {
    if (source === null && !pushCaveat) return;
    // `pathname` carries no query, so this drops both params at once.
    router.replace(pathname as Route);
    // Only ever runs once per real navigation-with-param — pathname/router
    // are stable refs here, source is read once into `message` above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (message === null) return;
    const t = window.setTimeout(() => setDismissed(true), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [message]);

  if (message === null || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="bcc-panel pointer-events-auto fixed bottom-6 left-1/2 z-40 flex w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 items-start justify-between gap-3 p-4 shadow-2xl"
    >
      <span className="font-serif text-sm text-bcc-text-secondary">{message}</span>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="bcc-mono inline-flex min-h-[28px] min-w-[28px] shrink-0 items-center justify-center text-[14px] text-bcc-text-secondary hover:text-bcc-text"
      >
        ✕
      </button>
    </div>
  );
}

export function AuthRedirectNotice() {
  return (
    <Suspense>
      <AuthRedirectNoticeInner />
    </Suspense>
  );
}
