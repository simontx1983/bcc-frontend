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

const NOOP = () => {
  /* full page — nothing to close before navigation */
};

export function NotificationsPageBody() {
  const { status } = useSession();
  const isAuthed = status === "authenticated";

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
          ) : (
            <p className="bcc-mono py-6 text-center text-bcc-text-secondary">
              Sign in to see your notifications.
            </p>
          )}
        </div>
      </article>
    </section>
  );
}
