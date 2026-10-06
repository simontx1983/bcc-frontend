"use client";

/**
 * useViewerScope — the one place a component asks "whose storage is this?"
 *
 * Returns the current viewer's storage scope: their id when signed in,
 * `ANON_SCOPE` when signed out, and `null` whenever identity is
 * UNAVAILABLE — the session is still loading, it is authenticated with no
 * usable id, or a viewer's session has started reading null without a
 * readable answer to say why. A `null` scope means reads return defaults
 * and writes are dropped — see `lib/auth/viewer-scope` for why guessing is
 * worse than waiting.
 *
 * ⚠ `status` alone is NOT enough to answer this. next-auth reports
 * `"unauthenticated"` for a transport failure exactly as it does for a real
 * sign-out, so trusting it filed a signed-in viewer's writes under the
 * SHARED anonymous scope during a blip — a measured, browser-verified
 * cross-account display path. The answer therefore combines `status` with
 * what a direct read of the endpoint has proved
 * (`lib/auth/session-identity`), in the order documented at the return.
 *
 * The scope CHANGES at runtime: `null → id` on a normal load, `anon → id`
 * on sign-in, `id → anon` on sign-out, and `id → other-id` when a second
 * account signs in without a document load. Every effect that seeds state
 * from storage must therefore depend on it, not run once on mount — a
 * mount-only read would show the signed-out default to someone who is
 * signed in, and (worse, before this change) the previous viewer's value
 * to the next one.
 *
 * It also performs the legacy purge, once per document: whatever earlier
 * versions wrote to unscoped keys is deleted rather than adopted. That
 * happens here, not in a sign-in handler, because this hook mounts on a
 * document load too — which is the only arrival an OAuth round trip or a
 * cold tab ever makes.
 */

import { useSession } from "next-auth/react";
import { useEffect, useMemo, useSyncExternalStore } from "react";

import {
  getEstablishedViewer,
  getServerSessionProof,
  getSessionProof,
  subscribeSessionIdentity,
} from "@/lib/auth/session-identity";
import {
  ANON_SCOPE,
  purgeLegacyUnscopedKeys,
  resolveViewerScope,
  type ViewerScope,
} from "@/lib/auth/viewer-scope";

/** Module-level so the purge runs once per document, not once per mount. */
let purged = false;

export function useViewerScope(): ViewerScope {
  const { data: session, status } = useSession();
  // What `status` alone cannot tell us: next-auth reports
  // "unauthenticated" for a network blip just as it does for a real
  // sign-out. See `lib/auth/session-identity`.
  const proof = useSyncExternalStore(
    subscribeSessionIdentity,
    getSessionProof,
    getServerSessionProof,
  );
  const established = useSyncExternalStore(
    subscribeSessionIdentity,
    getEstablishedViewer,
    () => null,
  );

  // Deliberately unconditional and not gated on `status`: legacy keys
  // belong to nobody we can identify, so an anonymous visitor's browser
  // should be cleaned too, and waiting for authentication would leave the
  // previous viewer's values sitting there for a visitor who never signs in.
  useEffect(() => {
    if (purged) return;
    purged = true;
    purgeLegacyUnscopedKeys();
  }, []);

  const viewerId = session?.user?.id;

  return useMemo(() => {
    // 1. A session object WITH an id is the strongest evidence there is.
    if (status === "authenticated" && typeof viewerId === "string" && viewerId !== "") {
      return viewerId;
    }
    // 2. A readable `{}` proved nobody is signed in: anonymous, for real.
    if (proof.kind === "anonymous") {
      return ANON_SCOPE;
    }
    // 3. A readable response named the viewer. This is what makes recovery
    //    IMMEDIATE: `useSession()` stays stuck at null until next-auth
    //    happens to re-read, but the bridge already read the truth, so the
    //    viewer's own scope is restored the moment the confirm lands —
    //    without waiting for a broadcast or another request.
    if (proof.kind === "viewer") {
      return proof.id;
    }
    // 4. A viewer HAS been on screen in this document, the session is no
    //    longer reporting them, and nothing has been proved: identity is
    //    unavailable, so neither namespace may be touched. Falling through
    //    to `status` here is the defect this closes — it filed a signed-in
    //    viewer's writes under the SHARED anonymous scope for the whole
    //    confirm window, and indefinitely after a give-up.
    if (established !== null) {
      return null;
    }
    // 5. No viewer has ever been here — a genuine anonymous visitor, or a
    //    session still loading. The ordinary case, unchanged.
    return resolveViewerScope(status, viewerId);
  }, [status, viewerId, proof, established]);
}

/** Test-only: forget that this document already purged. */
export function __resetViewerScopePurgeForTests(): void {
  purged = false;
}
