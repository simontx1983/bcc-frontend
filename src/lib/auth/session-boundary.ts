/**
 * session-boundary — the ONE place a viewer session is torn down.
 *
 * Three triggers, one path:
 *
 *   "user"     — the viewer pressed sign out.
 *   "expired"  — the server has told us, definitively, that the bearer
 *                cannot be refreshed, or that the account is no longer in
 *                good standing. NOT "a request 401'd"; see the refresh
 *                taxonomy in `lib/api/client.ts`.
 *   "switch"   — a different viewer took over this tab, including a
 *                change that arrived from ANOTHER tab via NextAuth's
 *                cross-tab session broadcast.
 *
 * ## Why a registry instead of an import
 *
 * The teardown needs the `QueryClient`, which lives in the app's provider
 * tree. The low-level API client must be able to *trigger* a teardown
 * without importing that tree — pulling `app/providers` into
 * `lib/api/client` would drag the whole React/provider graph into every
 * module that fetches, and would be a cycle (providers → hooks → client →
 * providers).
 *
 * So the provider registers its capabilities here on mount, and the
 * client imports only `endSession`. Nothing in this module imports React,
 * the providers, or `next-auth/react`.
 *
 * ## Why rendering is BLOCKED rather than the cache being reset
 *
 * `queryClient.clear()` empties the cache but does NOT reset a mounted
 * observer: `queryCache.clear()` calls `query.destroy()` and notifies
 * `"removed"`, which drops the entry while every mounted `useQuery` keeps
 * its last `currentResult`. Measured in a browser — cache at 0 entries,
 * the previous viewer's payload still on screen, for both an enabled and
 * a disabled observer. `removeQueries()` behaves the same.
 *
 * `resetQueries()` DOES clear the rendered value, because it calls
 * `query.reset()` and notifies — but it also refetches every ACTIVE
 * query, and during a teardown "active" means "still mounted under the
 * departing viewer". Firing those is the opposite of what a session
 * boundary is for.
 *
 * So the boundary closes a render GATE first. Subscribers (see
 * `PrivateRenderGate`) swap the application subtree for a neutral
 * placeholder, which unmounts every private surface. That destroys the
 * observers outright — there is nothing left holding a stale result and
 * nothing left to refetch — and it happens before any await, so it is the
 * first thing that takes effect.
 *
 * ## The viewer epoch
 *
 * Clearing is still not enough on its own: a request issued with viewer
 * A's bearer can be in flight when the boundary runs and resolve
 * afterwards. `cancelQueries` aborts the ones React Query owns, but a
 * resolved-then-awaited promise can still hand A's payload back to a
 * caller. So every authenticated read captures `currentViewerEpoch()`
 * before it fires and checks `isStaleEpoch()` after; a response from a
 * previous epoch is discarded rather than returned.
 */

/** Why the session is ending. */
export type SessionEndReason = "user" | "expired" | "switch";

/**
 * What actually happened to the browser's push subscription.
 *
 * Deliberately NOT a boolean. The browser's `unsubscribe()` can reject or
 * hang, and the server row can only be deleted while the session is still
 * alive — so "we tried" and "it is gone" are different facts and the UI
 * must not conflate them.
 */
export type PushCleanupOutcome =
  /** Browser subscription gone AND the server row deleted. */
  | "revoked"
  /** Browser subscription gone; the server row may survive. */
  | "unsubscribed-locally"
  /** `unsubscribe()` refused — this device may still receive the previous account's pushes. */
  | "unsubscribe-failed"
  /** Cleanup did not settle inside the budget — same caveat as a failure. */
  | "timed-out"
  /** Nothing was subscribed, so nothing to do. */
  | "not-subscribed";

/**
 * Whether viewer-scoped browser storage was fully removed.
 *
 * `localStorage` throws outright in some private-mode configurations and
 * when site data is blocked, so deletion cannot be promised. The UI copy
 * reads this instead of asserting a guarantee.
 */
export type StoragePurgeOutcome = "cleared" | "partial";

/**
 * True when the outcome leaves this device possibly still receiving the
 * previous account's notifications — i.e. when the UI must NOT claim the
 * cleanup worked.
 *
 * Lives here rather than beside the push code on purpose: it is a pure
 * predicate over the union above, and `SignOutModal` needs it. Importing
 * it from `lib/push/revoke` would pull `push-endpoints` → `api/client` →
 * `lib/env` into a presentational modal.
 */
export function pushCleanupNeedsWarning(
  outcome: PushCleanupOutcome,
): boolean {
  return outcome === "unsubscribe-failed" || outcome === "timed-out";
}

export interface SessionTeardownResult {
  reason: SessionEndReason;
  /** Private rendering was gated off and the query cache cancelled+cleared. */
  localStateCleared: boolean;
  /** Whether viewer-scoped storage could actually be removed. */
  storagePurge: StoragePurgeOutcome;
  /** The NextAuth sign-out call completed without throwing or timing out. */
  signedOut: boolean;
  /** Present when the sign-out call failed rather than timed out. */
  signOutError?: unknown;
  /** True when the sign-out call exceeded its budget. */
  signOutTimedOut: boolean;
  pushCleanup: PushCleanupOutcome;
}

/** Options a caller may use to steer where the viewer lands. */
export interface SessionEndOptions {
  /**
   * An `authNotice` slug carried through the navigation so the viewer gets
   * an explanation after the document reloads. A SLUG ONLY — it indexes
   * canned copy in `AuthRedirectNotice`, so nothing sensitive crosses the
   * URL.
   */
  notice?: AuthNoticeSlug;
  /** Where to land. Defaults to "/". */
  callbackUrl?: string;
}

/** The slugs this module may emit. Keep in sync with AuthRedirectNotice. */
export type AuthNoticeSlug = "signed-out" | "standing" | "push-cleanup";

export interface SessionTeardownHandlers {
  /**
   * Cancel in-flight queries and drop every cached entry. Must not throw.
   * Called AFTER the render gate has closed, so the observers it would
   * have notified are already gone.
   */
  purgeQueryCache: () => void;
  /** Remove viewer-scoped browser storage, preserving device preferences. */
  purgeViewerStorage: () => StoragePurgeOutcome;
  /**
   * Best-effort push revocation. MUST run while the session is still
   * valid — the server's DELETE is authenticated and ownership-checked.
   */
  revokePush: () => Promise<PushCleanupOutcome>;
  /** The NextAuth sign-out. Navigates on success; may reject or hang. */
  signOut: (callbackUrl: string) => Promise<void>;
}

/**
 * Push cleanup budget. Short on purpose: a stalled service-worker call
 * must never be the reason someone stays signed in.
 */
export const PUSH_CLEANUP_TIMEOUT_MS = 2_000;

/**
 * Sign-out budget. A hanging `/api/auth/signout` previously left the
 * teardown pending forever and the UI stuck on "Signing out…" — the same
 * failure the try/catch was added to fix, in a different disguise.
 */
export const SIGN_OUT_TIMEOUT_MS = 6_000;

let handlers: SessionTeardownHandlers | null = null;
let inFlight: Promise<SessionTeardownResult> | null = null;
let viewerEpoch = 0;

/** Render-gate state. `true` means: show no private content. */
let privateRenderBlocked = false;
const gateListeners = new Set<() => void>();

/**
 * Called once by the provider tree. Returns an unregister fn so a remount
 * (or a test) cannot leave a stale closure installed.
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

// ── the render gate ──────────────────────────────────────────────────

/** For `useSyncExternalStore`. */
export function isPrivateRenderBlocked(): boolean {
  return privateRenderBlocked;
}

/** For `useSyncExternalStore`. */
export function subscribePrivateRenderGate(onChange: () => void): () => void {
  gateListeners.add(onChange);
  return () => {
    gateListeners.delete(onChange);
  };
}

/**
 * Close the gate. Synchronous and first, so the private subtree is
 * unmounted before any await — no mounted observer survives to render a
 * stale result, and no active query survives to be refetched.
 */
function blockPrivateRender(): void {
  if (privateRenderBlocked) {
    return;
  }
  privateRenderBlocked = true;
  for (const listener of [...gateListeners]) {
    try {
      listener();
    } catch {
      // One bad subscriber must not stop the others, or the teardown.
    }
  }
}

/**
 * Drop this tab's view of the previous viewer WITHOUT signing out.
 *
 * Used when the session change originated elsewhere — another tab signed
 * out or signed in as someone else and NextAuth broadcast it here.
 * Calling `signOut` again would fight the other tab.
 *
 * Closes the render gate first for the same reason the full teardown
 * does: clearing the cache alone leaves mounted observers rendering the
 * previous viewer's payload.
 */
export function purgeViewerState(): StoragePurgeOutcome {
  blockPrivateRender();
  viewerEpoch += 1;
  try {
    handlers?.purgeQueryCache();
  } catch {
    // A purge that throws must not stop the storage purge below.
  }
  try {
    return handlers?.purgeViewerStorage() ?? "partial";
  } catch {
    return "partial";
  }
}

/**
 * Resolve with `onTimeout` if `work` has not settled within `ms`.
 *
 * A rejection is RE-THROWN rather than folded into `onTimeout`: for push
 * cleanup, "the browser refused" and "cleanup never finished" are
 * different facts, and collapsing them would make the outcome union a lie.
 */
function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: T): Promise<T> {
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

/** Compose the landing URL, carrying at most one notice slug. */
function landingUrl(
  opts: SessionEndOptions | undefined,
  pushCleanup: PushCleanupOutcome,
): string {
  const base = opts?.callbackUrl ?? "/";
  // An explicit notice wins; otherwise surface the push caveat, which is
  // the only thing the viewer could not otherwise discover.
  const slug: AuthNoticeSlug | null =
    opts?.notice ?? (pushCleanupNeedsWarning(pushCleanup) ? "push-cleanup" : null);
  if (slug === null) {
    return base;
  }
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}authNotice=${slug}`;
}

/**
 * End the session. Single-flight: concurrent callers — several
 * simultaneous 401s, or a 401 landing while the viewer is pressing sign
 * out — all await the same teardown instead of each starting one.
 */
export function endSession(
  reason: SessionEndReason,
  opts?: SessionEndOptions,
): Promise<SessionTeardownResult> {
  if (inFlight !== null) {
    return inFlight;
  }
  inFlight = runTeardown(reason, opts).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** True while a teardown is running. */
export function isEndingSession(): boolean {
  return inFlight !== null;
}

async function runTeardown(
  reason: SessionEndReason,
  opts?: SessionEndOptions,
): Promise<SessionTeardownResult> {
  const current = handlers;

  // 0. Hide private content IMMEDIATELY, before any await. Unmounting the
  //    subtree is what actually stops the previous viewer's data being
  //    rendered; the cache APIs do not.
  blockPrivateRender();

  // 1. Push next, because the server's DELETE is authenticated and
  //    ownership-checked — once the cookie is gone it can only 401.
  //    Bounded, and a rejection is recorded rather than thrown.
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

  // 2. Bump the epoch, cancel in-flight reads and drop local state. The
  //    gate is already closed, so this runs with no observers attached.
  let localStateCleared = false;
  let storagePurge: StoragePurgeOutcome = "partial";
  if (current !== null) {
    storagePurge = purgeViewerState();
    localStateCleared = true;
  }

  // 3. Sign out last, bounded. It navigates on success — anything after
  //    it may not run, which is why 0-2 come first.
  let signedOut = false;
  let signOutTimedOut = false;
  let signOutError: unknown;
  if (current !== null) {
    const target = landingUrl(opts, pushCleanup);
    const TIMED_OUT = Symbol("signout-timeout");
    try {
      const outcome = await withTimeout<unknown>(
        current.signOut(target).then(() => "ok"),
        SIGN_OUT_TIMEOUT_MS,
        TIMED_OUT,
      );
      if (outcome === TIMED_OUT) {
        signOutTimedOut = true;
      } else {
        signedOut = true;
      }
    } catch (err) {
      signOutError = err;
    }
  }

  return {
    reason,
    localStateCleared,
    storagePurge,
    signedOut,
    signOutTimedOut,
    ...(signOutError !== undefined ? { signOutError } : {}),
    pushCleanup,
  };
}

/** Test seam — drops the registration and resets all module state. */
export function __resetSessionBoundaryForTests(): void {
  handlers = null;
  inFlight = null;
  viewerEpoch = 0;
  privateRenderBlocked = false;
  gateListeners.clear();
}
