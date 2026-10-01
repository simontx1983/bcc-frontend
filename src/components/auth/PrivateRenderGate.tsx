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

import { useSyncExternalStore, type ReactNode } from "react";

import {
  failedTeardownResult,
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

  if (!blocked) {
    return <>{children}</>;
  }

  if (failed !== null) {
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
            onClick={() => {
              // NextAuth's own sign-out route, as a full navigation. Reloading
              // the current page would re-render it with the session cookie
              // still in place; this completes the sign-out server-side
              // without needing our fetch to work.
              window.location.assign("/api/auth/signout");
            }}
            className="bcc-auth-submit mt-5 w-full"
          >
            Finish signing out
          </button>
        </div>
      </div>
    );
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
