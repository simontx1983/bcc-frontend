"use client";

/**
 * useViewerScope — the one place a component asks "whose storage is this?"
 *
 * Returns the current viewer's storage scope: their id when signed in,
 * `ANON_SCOPE` when signed out, and `null` while the session is still
 * loading (or authenticated with no usable id). A `null` scope means
 * reads return defaults and writes are dropped — see `lib/auth/viewer-scope`
 * for why guessing is worse than waiting.
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
import { useEffect, useMemo } from "react";

import {
  purgeLegacyUnscopedKeys,
  resolveViewerScope,
  type ViewerScope,
} from "@/lib/auth/viewer-scope";

/** Module-level so the purge runs once per document, not once per mount. */
let purged = false;

export function useViewerScope(): ViewerScope {
  const { data: session, status } = useSession();

  // Deliberately unconditional and not gated on `status`: legacy keys
  // belong to nobody we can identify, so an anonymous visitor's browser
  // should be cleaned too, and waiting for authentication would leave the
  // previous viewer's values sitting there for a visitor who never signs in.
  useEffect(() => {
    if (purged) return;
    purged = true;
    purgeLegacyUnscopedKeys();
  }, []);

  return useMemo(
    () => resolveViewerScope(status, session?.user?.id),
    [status, session?.user?.id],
  );
}

/** Test-only: forget that this document already purged. */
export function __resetViewerScopePurgeForTests(): void {
  purged = false;
}
