"use client";

/**
 * useRevealBlockedMessages — the ONE place that resolves the real body
 * of messages from senders the viewer has blocked (bcc-trust #122).
 *
 * The data source is decided per message by comparing its `body` with
 * `BLOCKED_SENDER_PLACEHOLDER`:
 *
 *   - body is real text → returned as-is, synchronously, no request.
 *     This is the thread payload today.
 *   - body IS the placeholder → the backend withheld it; fetch it from
 *     the reveal endpoint. This is the thread payload once the backend
 *     follow-up lands.
 *
 * Gating on the comparison means no flag day: the same code is correct
 * before and after the backend change.
 *
 * Reveal is ephemeral and viewer-initiated. Nothing is fetched until
 * `enabled` (the user pressed Show); `gcTime: 0` drops a revealed body
 * from the cache as soon as its row unmounts, so leaving the thread or
 * reloading starts from the withheld state again. It never unblocks or
 * persists anything.
 */

import { useQueries } from "@tanstack/react-query";

import { getRevealedMessage } from "@/lib/api/messages-endpoints";
import { BLOCKED_SENDER_PLACEHOLDER, type MessageItem } from "@/lib/api/types";

export const REVEAL_BLOCKED_MESSAGE_QUERY_KEY_ROOT = ["blocked-message-reveal"] as const;

export interface RevealBlockedMessagesResult {
  /** Message id → revealed body; `null` until EVERY message resolved. */
  bodies: ReadonlyMap<number, string> | null;
  /** At least one message is being fetched from the reveal endpoint. */
  isLoading: boolean;
  /** The first reveal failure, if any (a `BccApiError` for API errors). */
  error: Error | null;
  /** Re-request only the reveals that failed. */
  retry: () => void;
}

function needsServerReveal(msg: MessageItem): boolean {
  return msg.body === BLOCKED_SENDER_PLACEHOLDER;
}

export function useRevealBlockedMessages(
  conversationId: number,
  messages: readonly MessageItem[],
  enabled: boolean,
): RevealBlockedMessagesResult {
  const fetched = messages.filter(needsServerReveal);

  const results = useQueries({
    queries: fetched.map((msg) => ({
      queryKey: [...REVEAL_BLOCKED_MESSAGE_QUERY_KEY_ROOT, conversationId, msg.id] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        getRevealedMessage(conversationId, msg.id, signal),
      enabled,
      staleTime: Infinity,
      gcTime: 0,
      retry: false,
      refetchOnWindowFocus: false,
    })),
  });

  const retry = () => {
    for (const r of results) {
      if (r.isError) void r.refetch();
    }
  };

  let error: Error | null = null;
  let isLoading = false;
  const fetchedBodies = new Map<number, string>();
  for (const [i, r] of results.entries()) {
    const msg = fetched[i];
    if (msg === undefined) continue;
    if (error === null && r.error !== null) error = r.error;
    if (r.isFetching) isLoading = true;
    if (r.data !== undefined) fetchedBodies.set(msg.id, r.data.body);
  }

  let bodies: Map<number, string> | null = null;
  if (enabled && error === null) {
    const all = new Map<number, string>();
    let complete = true;
    for (const msg of messages) {
      const body = needsServerReveal(msg) ? fetchedBodies.get(msg.id) : msg.body;
      if (body === undefined) {
        complete = false;
        break;
      }
      all.set(msg.id, body);
    }
    if (complete) bodies = all;
  }

  return { bodies, isLoading, error, retry };
}
