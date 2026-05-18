/**
 * Typed wrapper for the §4.31 /me/badges endpoint.
 *
 * One cached payload replaces the three previously-uncached polling
 * endpoints (/me/messages/unread-count, /me/notifications/unread-count,
 * and the 5s /me/conversations/{id}/messages poll). See useBadges.ts
 * for the consumer hook + cadence; the legacy unread-count hooks now
 * read from the same query under the hood.
 *
 * Auth required. Anonymous viewers should pass `enabled: false` at the
 * hook layer rather than calling this directly.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { BadgesResponse } from "@/lib/api/types";

export interface GetBadgesParams {
  /**
   * Conversation root ids the viewer currently has open. Backend caps
   * the list at 5; the auth gate is server-side (threads the viewer
   * isn't a participant of are silently absent from open_thread_hints).
   */
  openThreadIds?: readonly number[];
}

export function getBadges(
  params: GetBadgesParams = {},
  signal?: AbortSignal,
): Promise<BadgesResponse> {
  const search = new URLSearchParams();
  if (params.openThreadIds !== undefined && params.openThreadIds.length > 0) {
    // Backend tolerates extras (caps at 5 server-side), but trimming
    // here keeps the cache key short and the URL clean.
    const ids = params.openThreadIds
      .filter((id) => Number.isInteger(id) && id > 0)
      .slice(0, 5)
      .map(String);
    if (ids.length > 0) {
      search.set("open_threads", ids.join(","));
    }
  }
  const qs = search.toString();
  const path = qs === "" ? "me/badges" : `me/badges?${qs}`;
  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (signal !== undefined) init.signal = signal;
  return bccFetchAsClient<BadgesResponse>(path, init);
}
