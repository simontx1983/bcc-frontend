"use client";

/**
 * PrivateRenderGate — stops rendering private content the instant a
 * session boundary begins.
 *
 * ## Why this exists rather than a cache reset
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
 * Unmounting is the answer. When the gate closes, this component swaps the
 * whole application subtree for a neutral placeholder. Every private
 * surface unmounts, so:
 *
 *   - no mounted observer survives to render a stale result, and
 *   - no active query survives to be refetched.
 *
 * It closes synchronously, before any await in the teardown, so it is the
 * first thing that takes effect.
 *
 * The placeholder is deliberately content-free: no handle, no email, no
 * counts. It is the one thing on screen that is guaranteed to belong to
 * nobody.
 */

import { useSyncExternalStore, type ReactNode } from "react";

import {
  isPrivateRenderBlocked,
  subscribePrivateRenderGate,
} from "@/lib/auth/session-boundary";

/** Server snapshot: never blocked during SSR — there is no teardown yet. */
const serverSnapshot = () => false;

export function PrivateRenderGate({ children }: { children: ReactNode }) {
  const blocked = useSyncExternalStore(
    subscribePrivateRenderGate,
    isPrivateRenderBlocked,
    serverSnapshot,
  );

  if (!blocked) {
    return <>{children}</>;
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
