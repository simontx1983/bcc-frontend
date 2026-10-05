/**
 * session-identity — what is actually known about who is here, as opposed
 * to what `useSession()` happens to be reporting right now.
 *
 * ## Why this exists
 *
 * `next-auth`'s `fetchData` returns `null` on ANY error — a transport
 * failure, a 502, a rate-limited edge, a non-JSON body — and
 * `SessionProvider` then stores that null, so `useSession()` reports
 * `status: "unauthenticated"` for an ordinary network blip. Everything in
 * this codebase that destroys state already refuses to act on that
 * (`SessionBoundaryBridge` confirms with its own read first).
 *
 * Storage SCOPING had the mirror of that bug, measured in a browser on
 * 2026-10-02: `resolveViewerScope("unauthenticated", null)` answers
 * `ANON_SCOPE`, so for the whole confirm window — and after a give-up,
 * indefinitely — a signed-in viewer's writes were filed under `…::anon`.
 *
 * That is not a lost preference. The anonymous scope is SHARED by every
 * anonymous visitor to the browser, and `useRecentSearches` reads it, so a
 * search term typed during a blip became readable by the next anonymous
 * person — the cross-account display defect viewer scoping exists to
 * remove, reintroduced by a transient read failure.
 *
 * ## Two facts, because one is not enough
 *
 *   established  the last viewer the SESSION OBJECT itself reported in this
 *                document. Monotonic: once a viewer has been on screen,
 *                `status: "unauthenticated"` can no longer be taken at face
 *                value, because a blip produces exactly that.
 *   proof        what a DIRECT read of `/api/auth/session` established:
 *                nothing (`unproven`), a named `viewer`, or `anonymous` —
 *                a readable `{}`, which is the only shape that proves
 *                nobody is signed in.
 *
 * `established` is why the scope can refuse the anonymous namespace in the
 * SAME render that `status` flips. A first attempt relied on the bridge
 * marking doubt from an effect, which left a one-commit window where the
 * resolver still answered `ANON` — and a test caught it reading another
 * person's anonymous search history into a signed-in viewer's dropdown.
 * Effects cannot close that window; a fact recorded earlier can.
 *
 * `proof` is why recovery is immediate. After a confirm names the viewer,
 * `useSession()` is still stuck at null (next-auth's `_getSession`
 * early-returns while its cached session is null), so the scope must come
 * from the read the bridge already did rather than waiting for a broadcast
 * or the next request.
 *
 * ## Separate from the render gate, deliberately
 *
 * `isSessionUnknown()` governs what is SHOWN and flips only when the
 * confirm gives up (~16s), because hiding someone's work during a
 * two-second blip would be its own defect. These facts govern where state
 * is FILED and take effect immediately. Different questions, different
 * costs, different signals; collapsing them is what left the hole.
 *
 * ## What a proof is worth, and the boundary of this design
 *
 * A proof is evidence from a moment, not a standing fact. The bridge
 * therefore drops it (`clearSessionProof`) whenever anything suggests the
 * session may have changed, and re-establishes it from a fresh read. After
 * a recovery in which `useSession()` stays null, the bridge keeps the four
 * signals on watch for exactly this reason.
 *
 * Those four signals — `online`, `focus`, `visibilitychange`, and
 * next-auth's cross-tab broadcast — are everything a tab can learn without
 * polling. The honest boundary is what remains outside them:
 *
 *   A session cookie that stops being valid with NO accompanying event —
 *   edited in devtools, dropped by a profile-wide cookie purge, or simply
 *   expiring in a tab that is focused, online, visible, has no sibling tab,
 *   and makes no request — produces no notice of any kind. Nothing is
 *   missed in that case, because there is nothing to miss: no observation
 *   occurred. The app is not wrong about the session; it has not been told.
 *
 * That is a deliberate limit, not an oversight, and it is bounded: the next
 * authed request re-reads the cookie through `getSession()` and a protected
 * endpoint answers 401, the next focus or tab switch re-confirms, and a
 * sibling tab's activity broadcasts. Closing it completely would mean
 * polling `/api/auth/session` on a timer to catch arbitrary silent cookie
 * edits, which costs every viewer a request per interval forever to detect
 * something only a device's own operator can cause. It is not done.
 *
 * ⚠ Do not describe this as a missed event in a comment, a commit or a
 * report. Call it what it is: no event exists.
 *
 * ## No reset for the teardown path
 *
 * `session-boundary` has no imports at all — that is what lets the
 * low-level API client end a session without pulling the provider tree
 * into every fetching module — and a stale record cannot be read after a
 * teardown anyway: `blockPrivateRender()` unmounts every consumer of
 * `useViewerScope` (they all sit inside `PrivateRenderGate` in
 * `app/providers.tsx`) before the storage purge runs, and every teardown
 * path that leaves the gate shut ends in a document load, which starts
 * this module empty again.
 */

/** What a direct read of the session endpoint has established. */
export type SessionProof =
  | { readonly kind: "unproven" }
  | { readonly kind: "viewer"; readonly id: string }
  | { readonly kind: "anonymous" };

const UNPROVEN: SessionProof = { kind: "unproven" };

/**
 * Cached so the getters can be handed straight to `useSyncExternalStore`,
 * which re-renders forever if a snapshot is a fresh object on every call.
 */
let proof: SessionProof = UNPROVEN;
let established: string | null = null;

const listeners = new Set<() => void>();

/** For `useSyncExternalStore`. */
export function getSessionProof(): SessionProof {
  return proof;
}

/** For `useSyncExternalStore`'s server snapshot — always the same object. */
export function getServerSessionProof(): SessionProof {
  return UNPROVEN;
}

/** For `useSyncExternalStore`. A primitive, so no caching needed. */
export function getEstablishedViewer(): string | null {
  return established;
}

/** For `useSyncExternalStore`. */
export function subscribeSessionIdentity(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function notify(): void {
  // Copy first: a listener that unsubscribes while we iterate must not
  // reindex the set out from under us.
  for (const listener of [...listeners]) {
    listener();
  }
}

/**
 * The session object reported this viewer. Recorded as soon as a viewer is
 * on screen, so a later unexplained `"unauthenticated"` is read as doubt
 * rather than as anonymity — in the same render it arrives.
 */
export function noteEstablishedViewer(id: string): void {
  if (established === id) {
    return;
  }
  established = id;
  notify();
}

/** A readable response named this viewer: their scope is live again. */
export function markProvenViewer(id: string): void {
  if (proof.kind === "viewer" && proof.id === id) {
    return;
  }
  proof = { kind: "viewer", id };
  notify();
}

/** A readable `{}` proved nobody is signed in. */
export function markProvenAnonymous(): void {
  if (proof.kind === "anonymous") {
    return;
  }
  proof = { kind: "anonymous" };
  notify();
}

/**
 * A new, unconfirmed null: whatever an earlier read proved is no longer
 * current. Without this a SECOND blip would keep filing into the scope the
 * FIRST confirm had proved, long after that proof expired.
 */
export function clearSessionProof(): void {
  if (proof.kind === "unproven") {
    return;
  }
  proof = UNPROVEN;
  notify();
}

/** Test seam. */
export function __resetSessionIdentityForTests(): void {
  proof = UNPROVEN;
  established = null;
  listeners.clear();
}
