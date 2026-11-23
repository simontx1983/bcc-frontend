"use client";

/**
 * NotificationsPageBody — the /notifications page chrome around the
 * shared NotificationsPanel (§11 reuse — the SAME component the bell
 * modal and mobile dropdown render; this page adds only a panel shell).
 *
 * The panel head carries the page title, so the panel gets
 * `showTitle={false}` and its strip collapses to the Mark-all action —
 * identical to how SiteHeader's modal hosts it. `onNavigate` is a
 * no-op: a full page has no host surface to close before the panel's
 * own router.push fires.
 *
 * Surface family (§5.3): this shell is `.bcc-panel`, NOT `.bcc-paper`.
 * NotificationsPanel deliberately paints no background of its own and
 * uses the theme text scale, so a fixed-cream host put --bcc-text on
 * #f7efd9 — 1.03:1 in dark theme. The head mirrors SiteHeader's
 * NotifModal (the panel's other host): a bordered strip on the same
 * theme surface, so head and body read as one panel.
 *
 * ## Why `enabled` is session-derived rather than a literal
 *
 * This used to pass `enabled` as a hard-coded `true`, and neither
 * `useUnreadCount` nor `useNotifications` consults the session. The
 * page's only auth check was the server-side `getServerSession` redirect,
 * which never re-runs — so signing out while this page was open left a
 * private notification list rendered indefinitely, with nothing to
 * invalidate it. `/messages` has always gated on `isAuthed`; this page
 * was the outlier. The session boundary now also clears the cache, but
 * this surface should be correct on its own rather than rely on that.
 */

import { useSession } from "next-auth/react";

import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";
import { useSignInLink } from "@/lib/auth/sign-in-link";

const NOOP = () => {
  /* full page — nothing to close before navigation */
};

export function NotificationsPageBody() {
  const { status } = useSession();
  const isAuthed = status === "authenticated";
  const signIn = useSignInLink("/notifications");

  return (
    <section className="mx-auto mt-10 max-w-[720px] px-4 sm:px-7">
      <article className="bcc-panel overflow-hidden p-0">
        <header className="border-b border-bcc-border-light px-4 py-3.5">
          <h1
            className="bcc-stencil"
            style={{ fontSize: "16px", letterSpacing: "0.18em" }}
          >
            Notifications
          </h1>
        </header>
        <div className="px-3 py-3">
          {isAuthed ? (
            <NotificationsPanel
              enabled
              open
              showTitle={false}
              onNavigate={NOOP}
            />
          ) : status === "loading" ? null : (
            // F-320 (UX Low): the signed-out page said "Sign in" with no way
            // to; the link comes back here afterwards. Nothing while the
            // session is still loading, so a signed-in member never sees a
            // "Sign in" flash first.
            <div className="flex flex-col items-center pb-4">
              <p className="bcc-mono py-6 text-center text-bcc-text-secondary">
                Sign in to see your notifications.
              </p>
              <a
                href={signIn.href}
                onClick={signIn.onClick}
                className="bcc-mono inline-flex min-h-[44px] items-center text-[12px] tracking-[0.12em] text-bcc-text underline underline-offset-2"
              >
                Sign in
              </a>
            </div>
          )}
        </div>
      </article>
    </section>
  );
}
