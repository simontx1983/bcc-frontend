"use client";

/**
 * useBadges — single polling query for the §4.31 /me/badges endpoint.
 *
 * One cached payload coalesces what used to be three uncached polling
 * endpoints (/me/messages/unread-count, /me/notifications/unread-count,
 * and the per-thread 5s /me/conversations/{id}/messages poll). The
 * server-side cache is 15s with generation-counter invalidation;
 * client-side cadence is adaptive:
 *
 *   - Visible + any unread > 0 OR an open thread → 8s
 *   - Visible + all zeros + no open threads      → 30s, back off to 60s
 *   - Hidden                                     → 90s
 *
 * Open-thread registration:
 *   Conversation views call `useOpenThreadHint(id)` on mount which
 *   ref-counts the id into the Provider. The polling URL includes
 *   `?open_threads=<sorted-ids>` so the server returns per-thread
 *   "latest message id" hints. When a hint advances, the consumer
 *   invalidates its `['conversation', id, ...]` query and the
 *   per-thread 5s poll is gone.
 *
 * Auth: the Provider calls useSession() internally and disables the
 * query for anonymous viewers. Consumers don't need to thread an
 * `enabled` flag through.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  useQuery,
  useQueryClient,
  type Query,
} from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { getBadges } from "@/lib/api/me-badges-endpoint";
import type {
  BadgesOpenThreadHint,
  BadgesResponse,
  BccApiError,
} from "@/lib/api/types";

// ── Cadence constants ───────────────────────────────────────────────────

const POLL_ACTIVE_MS = 8_000;
const POLL_IDLE_MIN_MS = 30_000;
const POLL_IDLE_MAX_MS = 60_000;
const POLL_HIDDEN_MS = 90_000;
const POLL_BACKOFF_MULTIPLIER = 1.5;

/**
 * Root of the badges query key. Mutations that affect badge counts
 * (mark-read, send-message, reply) invalidate by this prefix so the
 * next poll fires immediately rather than waiting up to 8s for the
 * adaptive interval.
 */
export const BADGES_QUERY_KEY_ROOT = ["me", "badges"] as const;

// ── Context shape ───────────────────────────────────────────────────────

interface BadgesContextValue {
  /** Latest payload (undefined while the first fetch is in flight). */
  data: BadgesResponse | undefined;
  isLoading: boolean;
  error: BccApiError | null;
  /** Open thread ids the Provider is currently asking the server about. */
  openThreadIds: readonly number[];
  /** Ref-counted registration — the same id can be registered by multiple consumers. */
  registerOpenThread: (id: number) => void;
  unregisterOpenThread: (id: number) => void;
}

const BadgesContext = createContext<BadgesContextValue | null>(null);

// ── Public hooks ────────────────────────────────────────────────────────

/**
 * Read the latest badges payload. Returns `data: undefined` for
 * anonymous viewers (the Provider never fires the query in that state)
 * and during the first fetch.
 */
export function useBadges(): BadgesContextValue {
  const ctx = useContext(BadgesContext);
  if (ctx === null) {
    throw new Error("useBadges must be used inside <BadgesProvider>.");
  }
  return ctx;
}

/**
 * Register a conversation id as "open" with the Provider so the next
 * /me/badges poll includes a hint for it. Returns the current hint
 * (or null when the server hasn't returned one yet, e.g. first fetch
 * after open, or the viewer isn't a participant).
 *
 * Side-effect: when the hint's `latest_message_id` advances, the
 * caller's React Query `['conversation', id, ...]` queries are
 * invalidated so the thread refetches. Pass `null`/`0` to skip
 * registration (the typical "I'm not actually open yet" case).
 */
export function useOpenThreadHint(id: number | null): BadgesOpenThreadHint | null {
  const { data, registerOpenThread, unregisterOpenThread } = useBadges();
  const queryClient = useQueryClient();
  const lastSeenLatestRef = useRef<number | null>(null);

  // Register on mount / re-register if id changes.
  useEffect(() => {
    if (id === null || id <= 0) {
      return undefined;
    }
    registerOpenThread(id);
    return () => {
      unregisterOpenThread(id);
    };
  }, [id, registerOpenThread, unregisterOpenThread]);

  // Reset the "last seen" tracker when the thread id changes so the
  // first hint after an id swap doesn't fire a spurious invalidation.
  useEffect(() => {
    lastSeenLatestRef.current = null;
  }, [id]);

  const hint: BadgesOpenThreadHint | null = useMemo(() => {
    if (id === null || id <= 0 || data === undefined) {
      return null;
    }
    const map = data.open_thread_hints;
    // Server keys this map by stringified ints (PHP json encodes
    // int-keyed assoc arrays as string keys). Accept both for safety.
    const fromString = map[String(id)];
    if (fromString !== undefined) return fromString;
    const fromNumber = (map as unknown as Record<number, BadgesOpenThreadHint>)[id];
    return fromNumber ?? null;
  }, [data, id]);

  // When latest_message_id advances, invalidate the matching
  // conversation queries so the thread view refetches. This replaces
  // the old 5s flat poll inside useConversation.
  useEffect(() => {
    if (id === null || id <= 0 || hint === null) {
      return;
    }
    const latest = hint.latest_message_id;
    if (!Number.isFinite(latest) || latest <= 0) {
      return;
    }
    const prior = lastSeenLatestRef.current;
    if (prior !== null && latest > prior) {
      void queryClient.invalidateQueries({
        queryKey: ["conversation", id],
      });
    }
    lastSeenLatestRef.current = latest;
  }, [id, hint, queryClient]);

  return hint;
}

// ── Provider ────────────────────────────────────────────────────────────

export function BadgesProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const enabled = session.status === "authenticated";

  // Ref-counted registry of open thread ids. A Map<number, number>
  // where the value is the number of mounted consumers — that way
  // two views opening the same thread won't unregister each other.
  const [refCounts, setRefCounts] = useState<ReadonlyMap<number, number>>(
    () => new Map(),
  );

  const registerOpenThread = useCallback((id: number) => {
    if (!Number.isInteger(id) || id <= 0) return;
    setRefCounts((prev) => {
      const next = new Map(prev);
      next.set(id, (next.get(id) ?? 0) + 1);
      return next;
    });
  }, []);

  const unregisterOpenThread = useCallback((id: number) => {
    if (!Number.isInteger(id) || id <= 0) return;
    setRefCounts((prev) => {
      const next = new Map(prev);
      const current = next.get(id) ?? 0;
      if (current <= 1) {
        next.delete(id);
      } else {
        next.set(id, current - 1);
      }
      return next;
    });
  }, []);

  // Sort + cap so the query key is deterministic regardless of
  // registration order.
  const openThreadIds = useMemo<readonly number[]>(() => {
    const ids = Array.from(refCounts.keys()).sort((a, b) => a - b);
    return ids.slice(0, 5);
  }, [refCounts]);

  // Adaptive interval tracker.
  const currentIntervalRef = useRef<number>(POLL_ACTIVE_MS);

  const query = useQuery<BadgesResponse, BccApiError>({
    queryKey: [...BADGES_QUERY_KEY_ROOT, openThreadIds],
    queryFn: ({ signal }) => getBadges({ openThreadIds }, signal),
    enabled,
    staleTime: POLL_ACTIVE_MS / 2,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: false,
    refetchInterval: (q: Query<BadgesResponse, BccApiError>) => {
      if (!enabled) return false;

      const isVisible =
        typeof document !== "undefined" &&
        document.visibilityState === "visible";
      if (!isVisible) {
        currentIntervalRef.current = POLL_HIDDEN_MS;
        return POLL_HIDDEN_MS;
      }

      const data = q.state.data;
      const hasActivity =
        data !== undefined &&
        (data.messages_unread > 0 ||
          data.notifications_unread > 0 ||
          openThreadIds.length > 0);

      if (hasActivity) {
        currentIntervalRef.current = POLL_ACTIVE_MS;
        return POLL_ACTIVE_MS;
      }

      // Idle: geometric backoff from MIN to MAX, resets to MIN any
      // time activity returns (handled by the branch above).
      const next = Math.min(
        Math.max(POLL_IDLE_MIN_MS, Math.round(currentIntervalRef.current * POLL_BACKOFF_MULTIPLIER)),
        POLL_IDLE_MAX_MS,
      );
      currentIntervalRef.current = next;
      return next;
    },
  });

  const value = useMemo<BadgesContextValue>(
    () => ({
      data: query.data,
      isLoading: query.isLoading,
      error: query.error ?? null,
      openThreadIds,
      registerOpenThread,
      unregisterOpenThread,
    }),
    [
      query.data,
      query.isLoading,
      query.error,
      openThreadIds,
      registerOpenThread,
      unregisterOpenThread,
    ],
  );

  return <BadgesContext.Provider value={value}>{children}</BadgesContext.Provider>;
}
