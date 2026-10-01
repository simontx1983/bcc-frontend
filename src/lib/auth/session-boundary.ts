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
 * caller. So `bccFetchAsClient` captures `currentViewerEpoch()` before it
 * fires and checks `isStaleEpoch()` after; a response from a previous
 * epoch is discarded rather than returned.
 *
 * That is NOT every authenticated read, and this comment used to claim it
 * was. `bccSearchFetchAsClient` and `bccTrustFetch` also attach the bearer
 * and never consult the epoch. The gap costs nothing today because every
 * gate-closing path ends in a navigation or a reload, which discards the
 * document before such a response could be rendered — but it is a
 * property of those paths, not a guarantee this module enforces.
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
export type AuthNoticeSlug =
  | "signed-out"
  | "standing"
  | "push-cleanup"
  | "password-changed";

export interface SessionTeardownHandlers {
  /**
   * Clear only the keys a NEWCOMER would be shown. Used on viewer
   * arrival, where the person may equally be the same viewer returning.
   */
  purgeArrivalStorage: () => StoragePurgeOutcome;
  /**
   * Mark every cached entry stale WITHOUT cancelling in-flight work.
   * Arrival only: the entries are anonymous reads, so they need not be
   * dropped, but they must not be served to an authenticated viewer.
   */
  invalidateQueryCache: () => void;
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
/**
 * Set when a teardown has SETTLED without signing out.
 *
 * The gate unmounts the entire application subtree — including the
 * SignOutModal that used to display this — so the gate has to own the
 * failure message and the recovery control. Browser-verified: with the
 * modal gated away, a stalled sign-out showed a neutral placeholder
 * forever and offered nothing.
 */
let failedTeardown: SessionTeardownResult | null = null;
const gateListeners = new Set<() => void>();

/**
 * "We cannot tell whether this viewer is still here."
 *
 * Distinct from `privateRenderBlocked`, and deliberately so. That one is
 * TERMINAL and unmounts the subtree, which is right for a departure: the
 * viewer is leaving, and a document load follows. This one is RECOVERABLE
 * and must NOT unmount, because the only thing we actually know is that a
 * read failed — and unmounting would destroy work that cannot be
 * recovered from storage: `useComposerState` holds `attachedFile: File`, a
 * blob `previewUrl` and per-photo alt text; reply boxes and the blog
 * editor hold in-progress text.
 *
 * So the gate hides and disables in place while this is true, and reopens
 * when a readable response confirms the same viewer is still here.
 */
let sessionUnknown = false;

/** Whether private content must be hidden pending a readable answer. */
export function isSessionUnknown(): boolean {
  return sessionUnknown;
}

/** Set by the bridge: true when confirms are exhausted, false once settled. */
export function setSessionUnknown(next: boolean): void {
  if (sessionUnknown === next) {
    return;
  }
  sessionUnknown = next;
  notifyGate();
}

/**
 * How the gate's Retry control asks the bridge to confirm again. The
 * bridge owns the confirm (it has the viewer refs and the single-flight
 * guard); the gate only needs to ask.
 */
let recheck: (() => void) | null = null;

export function registerSessionRecheck(fn: () => void): () => void {
  recheck = fn;
  return () => {
    if (recheck === fn) {
      recheck = null;
    }
  };
}

export function requestSessionRecheck(): void {
  recheck?.();
}

/**
 * A notice parked by the surface that knows WHY the session is about to
 * end, for a teardown it does not itself trigger.
 *
 * Needed because a session can be in a known-doomed state for a while
 * before anything tears it down. After a password change whose session
 * update failed, the NextAuth session still holds the REVOKED bearer, so
 * the next authed poll 401s — the badges query alone polls every 30–60s
 * while visible, and refetches on window focus. That poll's teardown
 * passes `notice: "signed-out"`, which would replace the accurate "your
 * password changed, use the new one" with a generic "your session ended"
 * — and a viewer who then tries their OLD password has every reason to
 * believe the change failed.
 *
 * Parking the notice makes the explanation independent of which code path
 * happens to win the race, since teardown is single-flight.
 */
let pendingNotice: AuthNoticeSlug | null = null;

/**
 * Park the notice a later, involuntary teardown should carry. Pass `null`
 * to clear it. It outranks the `notice` passed to `endSession`, because
 * whoever parked it knew something the generic 401 path cannot.
 */
export function setPendingAuthNotice(slug: AuthNoticeSlug | null): void {
  pendingNotice = slug;
}

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

/**
 * The result of a teardown that finished WITHOUT signing out, or null.
 * Drives the gate's recovery panel.
 */
export function failedTeardownResult(): SessionTeardownResult | null {
  return failedTeardown;
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
function notifyGate(): void {
  for (const listener of [...gateListeners]) {
    try {
      listener();
    } catch {
      // One bad subscriber must not stop the others, or the teardown.
    }
  }
}

function blockPrivateRender(): void {
  // A verdict supersedes "unknown": the departure gate owns the screen
  // from here, and it unmounts, which is correct once we know the viewer
  // is leaving.
  sessionUnknown = false;
  if (privateRenderBlocked) {
    return;
  }
  privateRenderBlocked = true;
  notifyGate();
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
/**
 * The storage half on its own. Split out because `runTeardown` has
 * already closed the gate and dropped the cache by the time it gets here,
 * and calling the whole of `purgeViewerState` again purged the query
 * cache a second time.
 *
 * Returns `"partial"` when anything throws, or when no handlers are
 * registered at all — in which case nothing was cleared and the UI must
 * not claim otherwise.
 */
function purgeStorageOnly(): StoragePurgeOutcome {
  try {
    return handlers?.purgeViewerStorage() ?? "partial";
  } catch {
    return "partial";
  }
}

/**
 * Viewer ARRIVAL: drop a previous viewer's residue WITHOUT closing the
 * render gate.
 *
 * Anonymous -> authenticated has no previous viewer on screen, so the gate
 * must not close (it never reopens, and every sign-in flips the session in
 * place). But `localStorage` SURVIVES document loads, so a previous
 * viewer's keys can still be on this device even though this tab never saw
 * them:
 *
 *   - their sign-out's purge returned "partial" (storage access threw);
 *   - a teardown ran before the bridge had registered, so `handlers` was
 *     null and nothing was purged at all;
 *   - they never signed out — the session JWT simply aged past `maxAge`,
 *     or the browser clears cookies on exit.
 *
 * In each case the next person signs in and `bcc-recent-searches` is
 * rendered verbatim into their search dropdown, and the tour/onboarding
 * keys suppress or mis-position what they should be shown. Those are the
 * keys arrival clears; see `ARRIVAL_SCOPED_STORAGE_KEYS` for what it
 * deliberately leaves alone and why. Arrival purges state; only
 * DEPARTURE closes the gate.
 */
export function purgeArrivingViewerState(): StoragePurgeOutcome {
  // Storage only, and only the arrival subset.
  //
  // No epoch bump: the epoch exists to invalidate a DEPARTING viewer's
  // authenticated in-flight requests, and on arrival this tab never had a
  // viewer — every request in flight was anonymous, which
  // `bccFetchAsClient` exempts from the staleness check anyway. Bumping it
  // could only strand the ARRIVING viewer's own first read.
  //
  // Not a cache PURGE either: `purgeQueryCache` cancels in-flight
  // queries, and at login that aborts the new viewer's first reads at the
  // moment their surfaces mount.
  //
  // But keeping those entries FRESH is wrong. The cache is not
  // viewer-partitioned — `["card-entity", kind, id]`, `["user", handle]`,
  // the feed keys — and the view-models in it carry `viewer_is_member`,
  // `viewer_has_endorsed`, `viewer_attestation` and the whole `can_*`
  // block, which the contract documents as "always false for anonymous
  // viewers". With a 60s staleTime on card entities and five minutes on
  // `["user", handle]`, a viewer who bounces off a page to sign in and
  // comes straight back is served the ANONYMOUS payload: offered ENDORSE
  // when they have already endorsed, and denied controls they hold.
  //
  // So: invalidate rather than purge, and drop the inactive entries
  // outright.
  //
  // Precisely what that does, because the earlier wording here was wrong
  // and a wrong mechanism in a comment is how the next change breaks:
  // `invalidateQueries` marks every entry stale and refetches the ACTIVE
  // ones, and `refetchQueries` defaults `cancelRefetch: true`, so it DOES
  // cancel — but only an active query that already has `data`, i.e. a
  // stale anonymous refetch worth restarting. The arriving viewer's first
  // read has `data === undefined` and is continued, not aborted, which is
  // the property this relies on.
  //
  // Invalidating alone still left the anonymous payload renderable:
  // inactive entries keep their data, so on remount the component gets it
  // with `isFetching: true` for one round trip — and if that refetch
  // errors, query-core keeps the old data and the anonymous view-model
  // stays. Inactive entries hold nothing of the ARRIVING viewer's, so
  // removing them is free.
  try {
    handlers?.invalidateQueryCache();
  } catch {
    // Must not stop the storage purge below.
  }
  try {
    return handlers?.purgeArrivalStorage() ?? "partial";
  } catch {
    return "partial";
  }
}

export function purgeViewerState(): StoragePurgeOutcome {
  // Self-contained: the cross-tab path calls this on its own, with no
  // teardown around it.
  blockPrivateRender();
  viewerEpoch += 1;
  try {
    handlers?.purgeQueryCache();
  } catch {
    // A purge that throws must not stop the storage purge below.
  }
  return purgeStorageOnly();
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
  // Precedence: a parked notice outranks everything, because the surface
  // that parked it knew why the session was doomed; then an explicit
  // notice; then the push caveat on its own.
  const primary: AuthNoticeSlug | null =
    pendingNotice ??
    opts?.notice ??
    (pushCleanupNeedsWarning(pushCleanup) ? "push-cleanup" : null);

  const params: string[] = [];
  if (primary !== null) {
    params.push(`authNotice=${primary}`);
  }
  // The push caveat used to be DROPPED whenever any explicit notice was
  // given, because both competed for the single slug. It is the one thing
  // the viewer cannot discover for themselves — their old account may
  // keep receiving notifications on a shared device — so it now rides
  // along as its own flag instead of losing the race.
  if (primary !== "push-cleanup" && pushCleanupNeedsWarning(pushCleanup)) {
    params.push("authNoticePush=1");
  }

  if (params.length === 0) {
    return base;
  }
  const joiner = base.includes("?") ? "&" : "?";
  return `${base}${joiner}${params.join("&")}`;
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

  // A previous FAILED teardown's panel must not be what the viewer sees
  // while this one runs: its storagePurge / pushCleanup claims describe
  // the earlier attempt, not this one. The notify is load-bearing — the
  // gate reads this through `useSyncExternalStore`, which only re-reads
  // its snapshot when the subscription fires, so clearing the variable
  // alone left the stale panel on screen for the whole retry.
  if (failedTeardown !== null) {
    failedTeardown = null;
    notifyGate();
  }

  // 0. Hide private content IMMEDIATELY, before any await. Unmounting the
  //    subtree is what actually stops the previous viewer's data being
  //    rendered; the cache APIs do not.
  blockPrivateRender();

  // 0b. Invalidate viewer A's in-flight work in the SAME synchronous step.
  //     This used to live after the push await, which left a window of up
  //     to PUSH_CLEANUP_TIMEOUT_MS where `isStaleEpoch` was still false
  //     and `cancelQueries` had not run — so a response to a request
  //     issued with A's bearer was handed back to its caller and written
  //     into the cache. The gate stopped it being RENDERED, but the
  //     epoch backstop in lib/api/client is advertised as covering
  //     exactly this, and for those two seconds it did not.
  //
  //     Safe to do before push cleanup: that path uses the low-level
  //     `bccFetch` with an explicit token and never consults the epoch.
  viewerEpoch += 1;
  try {
    handlers?.purgeQueryCache();
  } catch {
    // A cache purge that throws must not stop the rest of the teardown.
  }

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
    storagePurge = purgeStorageOnly();
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

  const result: SessionTeardownResult = {
    reason,
    localStateCleared,
    storagePurge,
    signedOut,
    signOutTimedOut,
    ...(signOutError !== undefined ? { signOutError } : {}),
    pushCleanup,
  };

  // A successful sign-out navigates, so nothing needs to render. A failed
  // or timed-out one leaves the viewer on the gate placeholder, which is
  // now the only thing that can offer them a way out.
  if (!signedOut) {
    failedTeardown = result;
    notifyGate();
  }

  return result;
}

/** Test seam — drops the registration and resets all module state. */
export function __resetSessionBoundaryForTests(): void {
  handlers = null;
  inFlight = null;
  viewerEpoch = 0;
  privateRenderBlocked = false;
  failedTeardown = null;
  sessionUnknown = false;
  recheck = null;
  pendingNotice = null;
  gateListeners.clear();
}
