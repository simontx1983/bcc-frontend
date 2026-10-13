"use client";

/**
 * PrivateRenderGate — stops rendering private content the instant a
 * session boundary begins, and owns the recovery UI for a teardown that
 * could not finish.
 *
 * ## Why unmounting rather than a cache reset
 *
 * `queryClient.clear()` empties the cache but leaves a MOUNTED observer
 * holding its last result: `queryCache.clear()` calls `query.destroy()`
 * and notifies `"removed"`, neither of which resets a live `useQuery`.
 * Measured in a browser — 0 cache entries with the previous viewer's
 * payload still on screen, for both an enabled and a disabled observer.
 * `removeQueries()` is the same.
 *
 * `resetQueries()` does clear the rendered value, but it also refetches
 * every ACTIVE query — and during a teardown "active" means "still mounted
 * under the departing viewer". Issuing those requests is precisely what a
 * session boundary exists to prevent.
 *
 * So when the gate closes it swaps the whole application subtree for a
 * placeholder. Every private surface unmounts, so no observer survives to
 * render a stale result and no active query survives to be refetched. It
 * closes synchronously, before any await in the teardown.
 *
 * ## Why the recovery panel lives HERE
 *
 * The gate unmounts everything — including the `SignOutModal` that used to
 * show "we couldn't reach the server". Browser-verified: with the modal
 * gated away, a stalled sign-out showed a neutral placeholder forever and
 * offered the viewer nothing. The gate is the only thing on screen during a
 * teardown, so the gate has to carry the message and the way out.
 *
 * Both states are deliberately content-free about the viewer: no handle, no
 * email, no counts. They are the one thing on screen guaranteed to belong
 * to nobody.
 */

import { useState, useSyncExternalStore, type ReactNode } from "react";

import { forceSignOutNavigation } from "@/lib/auth/force-signout";
import type { SessionTeardownResult } from "@/lib/auth/session-boundary";
import {
  failedTeardownResult,
  isSessionUnknown,
  requestSessionRecheck,
  isPrivateRenderBlocked,
  pushCleanupNeedsWarning,
  subscribePrivateRenderGate,
} from "@/lib/auth/session-boundary";

/** Server snapshot: never blocked during SSR — there is no teardown yet. */
const falseSnapshot = () => false;
const nullSnapshot = () => null;

export function PrivateRenderGate({ children }: { children: ReactNode }) {
  const blocked = useSyncExternalStore(
    subscribePrivateRenderGate,
    isPrivateRenderBlocked,
    falseSnapshot,
  );
  const failed = useSyncExternalStore(
    subscribePrivateRenderGate,
    failedTeardownResult,
    nullSnapshot,
  );
  const unknown = useSyncExternalStore(
    subscribePrivateRenderGate,
    isSessionUnknown,
    falseSnapshot,
  );

  if (!blocked) {
    // The wrapper is ALWAYS rendered, even when nothing is hidden.
    //
    // That is load-bearing, not tidiness: swapping `<>{children}</>` for
    // `<Shield>{children}</Shield>` changes the element type at this
    // position, so React unmounts and remounts the whole subtree — which
    // is exactly the destruction this state exists to avoid. Keeping one
    // element and toggling its attributes keeps every child mounted, so
    // component state, File handles and blob URLs all survive, including
    // anything typed while hidden.
    //
    // `display: contents` when idle so the wrapper generates no box and
    // cannot affect layout; `display: none` when hiding so nothing is
    // painted at all — not merely transparent or off-screen, which would
    // still be readable over a shoulder or in a screenshot. `aria-hidden`
    // removes it from the accessibility tree and `inert` stops focus,
    // pointer and keyboard reaching it, so a hidden compose box cannot be
    // typed into or submitted by a stray Enter.
    return (
      <>
        <div
          {...(unknown ? { "data-private-shield": "true", inert: true } : {})}
          aria-hidden={unknown ? "true" : undefined}
          style={{ display: unknown ? "none" : "contents" }}
        >
          {children}
        </div>
        {unknown ? <SessionUnknownPanel /> : null}
      </>
    );
  }

  if (failed !== null) {
    return <RecoveryPanel failed={failed} />;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-screen items-center justify-center p-8 text-center"
    >
      <p className="bcc-mono text-bcc-text-secondary">Signing out…</p>
    </div>
  );
}

/**
 * Hides the private subtree without unmounting it, and says why.
 *
 * `display: none` rather than opacity or off-screen positioning: nothing
 * of it is painted, so nothing is readable over a shoulder or by a
 * screenshot. `aria-hidden` takes it out of the accessibility tree, and
 * `inert` stops focus, clicks and keyboard reaching it — so a hidden
 * compose box cannot be typed into or submitted by a stray Enter.
 *
 * The children keep rendering into that container, so their state, their
 * File handles and their blob URLs all survive, and anything typed while
 * hidden is still there when it reopens.
 */
function SessionUnknownPanel() {
  const [checking, setChecking] = useState(false);

  return (
    <>
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="bcc-panel w-[min(460px,100%)] p-6 text-center">
          <h1 className="bcc-stencil text-lg text-bcc-text">
            Can’t confirm you’re still signed in
          </h1>
          <p role="alert" className="mt-3 font-serif text-sm text-bcc-text-secondary">
            We couldn’t reach the server to check, so this page is hidden
            until we can. Nothing you were writing has been lost — it is
            still here, and it comes back when the check succeeds.
          </p>
          <button
            type="button"
            disabled={checking}
            onClick={() => {
              setChecking(true);
              requestSessionRecheck();
              // Re-enable regardless of outcome: a successful check
              // unmounts this panel, and a failed one has to be
              // retryable.
              window.setTimeout(() => {
                setChecking(false);
              }, RECHECK_SETTLE_MS);
            }}
            className="bcc-auth-submit mt-5 w-full"
          >
            {checking ? "Checking…" : "Retry"}
          </button>
        </div>
      </div>
    </>
  );
}

/**
 * How long the Retry control stays disabled. Comfortably longer than one
 * confirm attempt (3s) so a single press maps to one attempt, and short
 * enough that a viewer is never stuck waiting on a dead host.
 */
const RECHECK_SETTLE_MS = 4_000;

/**
 * How long a submitted sign-out gets to replace this document before the
 * control is offered again.
 *
 * Measured against the right bound, which the earlier comment was not:
 * the timer is scheduled INSIDE `.finally`, so the CSRF leg has already
 * settled and its 3s is irrelevant. What this has to outlast is the
 * sign-out POST — and the reason this panel is on screen at all is that
 * `SIGN_OUT_TIMEOUT_MS` (6s) was exhausted, so that is the floor.
 *
 * It is a window, not a guarantee: a host that answers after this still
 * gets the control re-offered, and a re-click restarts the navigation
 * already under way. Trading a rare restart against a permanently dead
 * escape hatch, which is what no timer at all produced.
 */
const RE_ENABLE_AFTER_MS = 20_000;

function RecoveryPanel({ failed }: { failed: SessionTeardownResult }) {
  // The control fetches a CSRF token before it can POST, and that fetch is
  // bounded at 3s. Without a pending state the viewer clicks into silence
  // for those 3s on exactly the wedged host that produced this panel.
  const [finishing, setFinishing] = useState(false);

  return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="bcc-panel w-[min(460px,100%)] p-6 text-center">
          <h1 className="bcc-stencil text-lg text-bcc-text">
            Almost signed out
          </h1>
          <p role="alert" className="mt-3 font-serif text-sm text-bcc-text-secondary">
            {/* Says only what is true. Private content is hidden either way —
                this component unmounted it — but DELETION cannot be promised
                when a storage access throws, as it does in private mode and
                with site data blocked. */}
            {failed.storagePurge === "cleared"
              ? "Private data on this device has been hidden and cleared"
              : "Private data on this device has been hidden, though some of it could not be deleted"}
            {failed.signOutTimedOut
              ? ", but the server didn’t respond in time to finish signing out."
              : ", but we couldn’t reach the server to finish signing out."}{" "}
            Use the button below to finish.
            {pushCleanupNeedsWarning(failed.pushCleanup)
              ? " Push notifications may also still be enabled on this device."
              : ""}
          </p>
          <button
            type="button"
            disabled={finishing}
            onClick={() => {
              // A real form POST to next-auth's sign-out route. A GET there
              // signs nothing out — middleware.ts redirects it to our
              // styled page and next-auth's GET only renders a
              // confirmation — so the previous version of this button was
              // cosmetic while telling the viewer they were done.
              setFinishing(true);
              // Give the control back only if nothing actually
              // navigated — but not on the promise, which was the
              // previous mistake. `form.submit()` merely INITIATES a
              // navigation and returns synchronously, so the promise
              // settles a microtask later, long before the POST
              // round-trips: re-enabling there fired on the success path
              // too, and a second click appends another form and
              // re-submits, which in a browser cancels and restarts the
              // navigation already under way.
              //
              // A live navigation replaces this document inside the
              // window below; a dead one does not, and has to give the
              // control back rather than leave a terminal gate with no
              // way forward.
              void forceSignOutNavigation().finally(() => {
                window.setTimeout(() => {
                  setFinishing(false);
                }, RE_ENABLE_AFTER_MS);
              });
            }}
            className="bcc-auth-submit mt-5 w-full"
          >
            {finishing ? "Finishing…" : "Finish signing out"}
          </button>
        </div>
      </div>
    );
  }

