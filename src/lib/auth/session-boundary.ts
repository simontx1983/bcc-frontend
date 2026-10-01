/**
 * session-boundary — the ONE place a viewer session is torn down.
 *
 * Three triggers, one path:
 *
 *   "user"     — the viewer pressed sign out.
 *   "expired"  — the server has told us, definitively, that the bearer
 *                cannot be refreshed. NOT "a request 401'd"; see the
 *                refresh taxonomy in `lib/api/client.ts`.
 *   "switch"   — a different viewer took over this tab, including a
 *                change that arrived from ANOTHER tab via NextAuth's
 *                cross-tab session broadcast.
 *
 * ## Why a registry instead of an import
 *
 * The teardown needs the `QueryClient`, which lives in the app's
 * provider tree. The low-level API client must be able to *trigger* a
 * teardown without importing that tree — pulling `app/providers` into
 * `lib/api/client` would drag the whole React/provider graph into every
 * module that fetches, and would be a cycle (providers → hooks →
 * client → providers).
 *
 * So the provider registers its capabilities here on mount, and the
 * client imports only `endSession`. Nothing in this module imports
 * React, the providers, or `next-auth/react`.
 *
 * ## The viewer epoch
 *
 * Clearing the cache is not enough on its own: a request issued with
 * viewer A's bearer can still be in flight when the boundary runs, and
 * resolve afterwards. `cancelQueries` aborts the ones React Query owns,
 * but a resolved-then-awaited promise can still hand A's payload back to
 * a caller. So every authenticated read captures `currentViewerEpoch()`
 * before it fires and checks `isStaleEpoch()` after; a response from a
 * previous epoch is discarded rather than returned. The epoch is the
 * backstop that makes "late responses cannot display the previous
 * viewer's data" true even when cancellation loses the race.
 */

/** Why the session is ending. Drives nothing but telemetry and copy. */
export type SessionEndReason = "user" | "expired" | "switch";

/**
 * What actually happened to the browser's push subscription.
 *
 * Deliberately NOT a boolean. The browser's `unsubscribe()` can reject
 * or hang, and the server row can only be deleted while the session is
 * still alive — so "we tried" and "it is gone" are different facts and
 * the UI must not conflate them.
 */
export type PushCleanupOutcome =
  /** Browser subscription gone AND the server row deleted. */
  | "revoked"
  /** Browser subscription gone; the server row may survive (no id, or the DELETE failed). */
  | "unsubscribed-locally"
  /** `unsubscribe()` rejected — this device may still receive the previous account's pushes. */
  | "unsubscribe-failed"
  /** Cleanup did not settle inside the budget — same caveat as a failure. */
  | "timed-out"
  /** Nothing was subscribed, so nothing to do. */
  | "not-subscribed";

export interface SessionTeardownResult {
  reason: SessionEndReason;
  /** Cache cancelled+cleared and viewer-scoped storage purged. */
  localStateCleared: boolean;
  /** The NextAuth sign-out call completed without throwing. */
  signedOut: boolean;
  /** Present when the sign-out call itself failed. */
  signOutError?: unknown;
  pushCleanup: PushCleanupOutcome;
}

/**
 * Capabilities the provider tree supplies. Each is independently
 * failable; `endSession` is responsible for ordering and for not
 * letting one failure strand the others.
 */
export interface SessionTeardownHandlers {
  /**
   * Cancel in-flight queries and drop every cached entry. Must be
   * synchronous-ish and must not throw; it is the step that makes
   * private data stop being rendered.
   */
  purgeQueryCache: () => void;
  /** Remove viewer-scoped browser storage, preserving device preferences. */
  purgeViewerStorage: () => void;
  /**
   * Best-effort push revocation. MUST run while the session is still
   * valid — the server's DELETE is authenticated and ownership-checked.
   */
  revokePush: () => Promise<PushCleanupOutcome>;
  /** The NextAuth sign-out. May navigate; may also reject. */
  signOut: () => Promise<void>;
}

/**
 * Push cleanup budget. Short on purpose: a stalled service-worker call
 * must never be the reason someone stays signed in. Exported so the
 * test can assert the bound rather than guess it.
 */
export const PUSH_CLEANUP_TIMEOUT_MS = 2_000;

let handlers: SessionTeardownHandlers | null = null;
let inFlight: Promise<SessionTeardownResult> | null = null;
let viewerEpoch = 0;

/**
 * Called once by the provider tree. Returns an unregister fn so a
 * remount (or a test) cannot leave a stale closure installed.
 */
export function registerSessionTeardown(
  next: SessionTeardownHandlers,
): () => void {
  handlers = next;
  return () => {
    if (handlers === next) {
      handlers = null;
    }
  };
}

/** The epoch an authenticated read should capture before it fires. */
export function currentViewerEpoch(): number {
  return viewerEpoch;
}

/** True once the boundary has moved on from the epoch a read started in. */
export function isStaleEpoch(epoch: number): boolean {
  return epoch !== viewerEpoch;
}

/**
 * Drop this tab's view of the previous viewer WITHOUT signing out.
 *
 * Used when the session change originated elsewhere — another tab
 * signed out or signed in as someone else, and NextAuth broadcast it
 * here. Calling `signOut` again in that case would fight the other tab;
 * all this tab has to do is stop showing data that is no longer ours.
 */
export function purgeViewerState(): void {
  viewerEpoch += 1;
  try {
    handlers?.purgeQueryCache();
  } catch {
    // A purge that throws must not stop the storage purge below.
  }
  try {
    handlers?.purgeViewerStorage();
  } catch {
    // Storage can throw in private mode / with site data blocked.
  }
}

/**
 * Resolve with `onTimeout` if `work` has not settled within `ms`.
 *
 * A rejection is RE-THROWN rather than folded into `onTimeout`: "the
 * browser refused to unsubscribe" and "cleanup never finished" are
 * different facts, and collapsing them would make the outcome union a
 * lie. The caller's catch turns the rejection into
 * `"unsubscribe-failed"`.
 */
function withTimeout<T>(
  work: Promise<T>,
  ms: number,
  onTimeout: T,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(onTimeout);
      }
    }, ms);
    work.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      (err: unknown) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      },
    );
  });
}

/**
 * End the session. Single-flight: concurrent callers — several
 * simultaneous 401s, or a 401 landing while the viewer is pressing
 * sign out — all await the same teardown instead of each starting one.
 */
export function endSession(
  reason: SessionEndReason,
): Promise<SessionTeardownResult> {
  if (inFlight !== null) {
    return inFlight;
  }
  inFlight = runTeardown(reason).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** True while a teardown is running. Lets callers skip redundant work. */
export function isEndingSession(): boolean {
  return inFlight !== null;
}

async function runTeardown(
  reason: SessionEndReason,
): Promise<SessionTeardownResult> {
  const current = handlers;

  // Order is load-bearing.
  //
  // 1. Push FIRST, because the server's DELETE is authenticated and
  //    ownership-checked — once the cookie is gone it can only 401.
  //    Bounded, and a rejection or a stall is recorded rather than
  //    thrown: nothing here may prevent the sign-out below.
  let pushCleanup: PushCleanupOutcome = "not-subscribed";
  if (current !== null) {
    try {
      pushCleanup = await withTimeout(
        current.revokePush(),
        PUSH_CLEANUP_TIMEOUT_MS,
        "timed-out",
      );
    } catch {
      pushCleanup = "unsubscribe-failed";
    }
  }

  // 2. Bump the epoch and drop local state BEFORE signing out, so that
  //    even if the sign-out call fails the private data is already off
  //    screen. This is what makes finding-6 recovery honest: we can
  //    always say "your data is cleared here", separately from whether
  //    the server was reachable.
  let localStateCleared = false;
  if (current !== null) {
    purgeViewerState();
    localStateCleared = true;
  }

  // 3. Sign out last. It may navigate — anything after it may not run,
  //    which is exactly why steps 1 and 2 come first.
  let signedOut = false;
  let signOutError: unknown;
  if (current !== null) {
    try {
      await current.signOut();
      signedOut = true;
    } catch (err) {
      signOutError = err;
    }
  }

  return {
    reason,
    localStateCleared,
    signedOut,
    ...(signOutError !== undefined ? { signOutError } : {}),
    pushCleanup,
  };
}

/** Test seam — drops the registration and resets the epoch. */
export function __resetSessionBoundaryForTests(): void {
  handlers = null;
  inFlight = null;
  viewerEpoch = 0;
}
