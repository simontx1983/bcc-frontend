"use client";

/**
 * useUnreadMessageCount — GET /me/messages/unread-count (§4.19).
 *
 * Powers the global header DM badge. Adaptive polling that mirrors
 * PeepSo's `peepsomessages.js` cadence:
 *
 *   - Visible tab + count just changed   → 5s
 *   - Visible tab + steady state         → multiply by 1.5 each cycle,
 *                                            cap at 30s (so a quiet
 *                                            inbox stops spamming
 *                                            after ~5 cycles)
 *   - Hidden tab                          → 30s (long-poll equivalent)
 *
 * `enabled` is the parent-supplied auth signal — anonymous viewers
 * never fire this query (matches `useUnreadCount` notification badge).
 */

import { useRef } from "react";
import { useQuery, type Query } from "@tanstack/react-query";

import { getUnreadMessageCount } from "@/lib/api/messages-endpoints";
import type { BccApiError, UnreadMessageCountResponse } from "@/lib/api/types";

const POLL_MIN_MS = 5_000;
const POLL_MAX_MS = 30_000;
const POLL_BACKOFF_MULTIPLIER = 1.5;

export const UNREAD_MESSAGE_COUNT_QUERY_KEY = ["messages", "unread-count"] as const;

export interface UseUnreadMessageCountOptions {
  /** Pass false for anonymous viewers; the query short-circuits without firing. */
  enabled: boolean;
}

export function useUnreadMessageCount({ enabled }: UseUnreadMessageCountOptions) {
  // Track the prior count + the current adaptive interval. Refs keep
  // the React Query callback referentially stable; updating them
  // doesn't re-run the hook.
  const priorCount = useRef<number | null>(null);
  const currentInterval = useRef<number>(POLL_MIN_MS);

  return useQuery<UnreadMessageCountResponse, BccApiError>({
    queryKey: UNREAD_MESSAGE_COUNT_QUERY_KEY,
    queryFn: ({ signal }) => getUnreadMessageCount(signal),
    enabled,
    staleTime: POLL_MIN_MS / 2,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: (query: Query<UnreadMessageCountResponse, BccApiError>) => {
      if (!enabled) return false;

      const isVisible =
        typeof document !== "undefined" &&
        document.visibilityState === "visible";
      if (!isVisible) {
        // Hidden tab — single-shot long-poll cadence.
        currentInterval.current = POLL_MAX_MS;
        return POLL_MAX_MS;
      }

      const data = query.state.data;
      const count = data ? data.count : null;
      if (count === null) {
        currentInterval.current = POLL_MIN_MS;
        return POLL_MIN_MS;
      }

      // Count changed (either side of zero) → reset to MIN. Otherwise
      // back off geometrically up to MAX.
      if (priorCount.current !== count) {
        priorCount.current = count;
        currentInterval.current = POLL_MIN_MS;
        return POLL_MIN_MS;
      }
      const next = Math.min(
        Math.round(currentInterval.current * POLL_BACKOFF_MULTIPLIER),
        POLL_MAX_MS,
      );
      currentInterval.current = next;
      return next;
    },
  });
}
