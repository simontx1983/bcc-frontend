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
 */

import type { Route } from "next";
import { Suspense, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

const AUTO_DISMISS_MS = 7000;

const COPY: Record<string, string> = {
  login: "You're already signed in — no need to log in again.",
  signup: "You're already a member and signed in — no need to sign up again.",
  "forgot-password":
    "You're already signed in, so there's nothing to reset. Sign out first if you meant to change your password.",
};

function AuthRedirectNoticeInner() {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const source = searchParams.get("authNotice");

  const [message] = useState<string | null>(() =>
    source !== null ? (COPY[source] ?? null) : null,
  );
  const [dismissed, setDismissed] = useState(false);

  // Scrub the param off the URL on mount so a refresh doesn't re-trigger
  // this — the notice is a one-time "here's why you landed here", not a
  // persistent state of the page.
  useEffect(() => {
    if (source === null) return;
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
