/**
 * Withdrawing a resource the server has stopped authorising.
 *
 * ## The policy this implements
 *
 * When a refetch of the resource currently on screen returns a confirmed
 * denial code (`bcc_forbidden` / `bcc_permission_denied` / `bcc_blocked`),
 * the client stops displaying that resource and drops its cached payload.
 * The server's latest authoritative answer is "you may not read this", and
 * continuing to paint the previous answer ignores it.
 *
 * ⚠ **What this does NOT claim.** It stops the APP from continuing to
 * display the resource. It does not and cannot un-send information the
 * viewer already received: the bytes reached the browser, and may sit in
 * the HTTP cache, devtools, a screenshot, or the viewer's memory. This is
 * the same boundary viewer-scoped storage has — it prevents continued
 * display, not access to what was already served. Do not describe it as a
 * security control.
 *
 * ## Scope — deliberately narrow
 *
 * ONLY a denied refetch of the same resource withdraws anything:
 *
 *   - a TRANSIENT failure (5xx, rate limit, network) keeps the rows,
 *     because the server never said no;
 *   - a denied NEXT PAGE keeps the earlier pages, because a refusal of page
 *     2 is not a statement about page 1 — the rows already shown were
 *     served under their own authorised 200;
 *   - a denied FIRST load has nothing to withdraw.
 *
 * It also never signs anyone out and never touches drafts or any other
 * storage. The only state it drops is this one query's cached payload.
 *
 * ## Why the latch, and why removal happens in the PARENT
 *
 * `removeQueries` on a key that still has a mounted observer does not
 * leave the resource gone: the observer re-creates the entry on the next
 * render with no data, so TanStack immediately refetches — which is denied
 * again, which removes again. That is an infinite loop, and it was the
 * first thing this had to avoid.
 *
 * So the component that OWNS the query must be unmounted before its cache
 * entry is removed. The gate therefore lives in a parent: the child reports
 * the denial, the parent latches it and stops rendering the child, and only
 * then — in the parent's effect, which React runs after the child's unmount
 * in the same commit — is the entry removed. Once latched, the child never
 * renders again, so nothing re-subscribes and nothing refetches.
 *
 * ## Recovery
 *
 * The latch is component state keyed on the resource, so it resets when the
 * resource changes or the panel remounts (a navigation, a tab switch, a
 * reload). The next mount is an ordinary first load: if permission has been
 * restored, it fetches and renders normally. Nothing needs to clear the
 * latch explicitly, and nothing polls the denied resource in the meantime.
 */

import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import { isPermissionDenial } from "@/lib/api/errors";

/**
 * Should a denied read withdraw what is on screen?
 *
 * True only for a read of the SAME resource that is already showing data.
 * `isFetchNextPageError` is deliberately absent — see the scope note above.
 *
 * @param error              the query's current error
 * @param isSameResourceRead the query refreshed what it had, rather than
 *                           asking for a further page (always true for an
 *                           unpaged read, which has no further page)
 * @param hasRenderedData    there is a payload on screen to withdraw
 */
export function shouldWithdrawOnDenial(
  error: unknown,
  isSameResourceRead: boolean,
  hasRenderedData: boolean,
): boolean {
  return isSameResourceRead && hasRenderedData && isPermissionDenial(error);
}

export interface DenialGate {
  /** The resource has been withdrawn; render the denial state instead. */
  withdrawn: boolean;
  /** Called by the query owner when it sees a denied same-resource read. */
  withdraw: () => void;
}

/**
 * Latch + loop-safe cache removal, for the PARENT of the query owner.
 *
 * `queryKey` is removed with `exact: true` so a root-prefixed sibling — the
 * same handle's albums, say, or another card's watchers — is never caught
 * by a partial match.
 */
export function useDenialGate(queryKey: QueryKey): DenialGate {
  const qc = useQueryClient();
  const [withdrawn, setWithdrawn] = useState(false);

  // Serialised so the reset below compares by VALUE: a fresh array literal
  // every render would otherwise reset the latch on every render.
  const serialised = JSON.stringify(queryKey);
  const lastKey = useRef(serialised);

  // Removal happens AT MOST ONCE per withdrawn resource, enforced with a
  // ref rather than left to effect dependencies. A test caught why that
  // matters: the effect fired three times because `useQueryClient()`
  // returned a fresh object each render, and three removals of a key that
  // still has a live observer is the refetch loop this exists to prevent.
  // Identity stability of the client is not something this module should
  // have to assume.
  const removedFor = useRef<string | null>(null);

  if (lastKey.current !== serialised) {
    lastKey.current = serialised;
    if (withdrawn) {
      // A different resource is being shown now; the previous refusal says
      // nothing about it. Reset during render so the new resource is never
      // painted as denied, not even for one commit.
      setWithdrawn(false);
    }
    // No re-arm needed here: `removedFor` holds the OLD key, so the guard
    // below compares it against the NEW `serialised` and lets the removal
    // through. A `removedFor.current = null` line looked prudent and was
    // dead — a mutation deleting it stayed green, which is the only honest
    // way to find that out.
  }

  useEffect(() => {
    if (!withdrawn) return;
    if (removedFor.current === serialised) return;
    removedFor.current = serialised;
    // The query owner has already unmounted (child cleanup runs before the
    // parent effect in the same commit), so nothing is observing this key
    // and the removal cannot provoke a refetch.
    qc.removeQueries({ queryKey, exact: true });
    // `serialised` stands in for `queryKey`, which is a new array each
    // render; the key VALUE and the client are the real dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withdrawn, qc, serialised]);

  const withdraw = useCallback(() => setWithdrawn(true), []);
  return { withdrawn, withdraw };
}

/**
 * The query owner's half: report a denied same-resource read.
 *
 * In an effect rather than during render because it sets parent state.
 *
 * No once-guard: `withdraw()` is `setWithdrawn(true)`, which React bails
 * out of when the value is unchanged, and the latch unmounts this component
 * anyway — so a second call is unobservable. A ref guard here also survived
 * its mutation, confirming it was insurance against nothing.
 */
export function useReportDenial(shouldWithdraw: boolean, withdraw: () => void): void {
  useEffect(() => {
    if (!shouldWithdraw) return;
    withdraw();
  }, [shouldWithdraw, withdraw]);
}
