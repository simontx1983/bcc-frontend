"use client";

/**
 * NotificationsPageBody — the /notifications page chrome around the
 * shared NotificationsPanel (§11 reuse — the SAME component the bell
 * modal and mobile dropdown render; this page adds only a paper shell).
 *
 * The paper-head carries the page title, so the panel gets
 * `showTitle={false}` and its strip collapses to the Mark-all action —
 * identical to how SiteHeader's modal hosts it. `onNavigate` is a
 * no-op: a full page has no host surface to close before the panel's
 * own router.push fires.
 */

import { NotificationsPanel } from "@/components/notifications/NotificationsPanel";

const NOOP = () => {
  /* full page — nothing to close before navigation */
};

export function NotificationsPageBody() {
  return (
    <section className="mx-auto mt-10 max-w-[720px] px-4 sm:px-7">
      <article className="bcc-paper">
        <header className="bcc-paper-head">
          <h1
            className="bcc-stencil"
            style={{ fontSize: "16px", letterSpacing: "0.18em" }}
          >
            Notifications
          </h1>
        </header>
        <div className="px-3 py-3">
          <NotificationsPanel
            enabled
            open
            showTitle={false}
            onNavigate={NOOP}
          />
        </div>
      </article>
    </section>
  );
}
