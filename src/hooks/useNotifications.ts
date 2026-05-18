"use client";

/**
 * useNotifications + useUnreadCount — §I1 bell dropdown queries.
 *
 * Two distinct hooks because the surfaces have different cadences:
 *   - The unread badge polls (60s + window focus) so it picks up new
 *     notifications even while the dropdown stays closed.
 *   - The list itself only fetches when the dropdown opens; no point
 *     keeping the full list warm if nothing's looking at it.
 *
 * Both gate on a `enabled` flag — call sites pass the auth state so
 * anonymous viewers don't fire 401-spam against the endpoint.
 *
 * Mark-read mutation patches the cache optimistically so the row
 * loses its unread dot the moment the user clicks; `unread-count`
 * invalidation lands shortly after via onSettled.
 */

import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";

import { BADGES_QUERY_KEY_ROOT, useBadges } from "@/hooks/useBadges";
import {
  getNotifications,
  markNotificationsRead,
} from "@/lib/api/notifications-endpoints";
import type {
  BccApiError,
  NotificationsListResponse,
  NotificationsMarkReadResponse,
  NotificationsUnreadCountResponse,
} from "@/lib/api/types";

const PAGE_SIZE = 20;

export const NOTIFICATIONS_QUERY_KEY = ["me", "notifications"] as const;
/**
 * @deprecated The standalone unread-count polling query is gone — the
 * badge now reads from `useBadges()` via the shim below. This key is
 * retained as a no-op invalidation target for legacy callers; new
 * code should invalidate `BADGES_QUERY_KEY_ROOT` instead.
 */
export const UNREAD_COUNT_QUERY_KEY = ["me", "notifications", "unread-count"] as const;

interface UseNotificationsOptions {
  /** Pass false for anonymous viewers; the hook short-circuits without firing. */
  enabled: boolean;
}

export function useNotifications({ enabled }: UseNotificationsOptions) {
  return useInfiniteQuery<
    NotificationsListResponse,
    BccApiError,
    InfiniteData<NotificationsListResponse>,
    QueryKey,
    string | null
  >({
    queryKey: NOTIFICATIONS_QUERY_KEY,
    initialPageParam: null,
    queryFn: ({ pageParam, signal }) =>
      getNotifications({ cursor: pageParam, limit: PAGE_SIZE }, signal),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.next_cursor : undefined,
    enabled,
    staleTime: 30_000,
  });
}

/**
 * Bell badge unread count. Thin shim over `useBadges` — the polling
 * lives there now; this hook selects its slice of the shared payload
 * and returns the same shape NotificationBell.tsx already consumes.
 *
 * The `enabled` arg is accepted for source-compat; auth gating is
 * centralised in `BadgesProvider`, which reads `useSession()` and
 * never fires the query for anonymous viewers.
 */
export function useUnreadCount(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- kept for source-compat with the legacy hook signature; auth gating moved into BadgesProvider
  _options: UseNotificationsOptions = { enabled: true },
): {
  data: NotificationsUnreadCountResponse | undefined;
  isLoading: boolean;
  error: BccApiError | null;
} {
  const { data, isLoading, error } = useBadges();
  return {
    data: data === undefined ? undefined : { unread_count: data.notifications_unread },
    isLoading,
    error,
  };
}

export function useMarkReadMutation() {
  const queryClient = useQueryClient();

  return useMutation<NotificationsMarkReadResponse, BccApiError, number | undefined>({
    mutationFn: (id) => markNotificationsRead(id),

    onMutate: (id) => {
      // Optimistic patch: flip the touched row(s) to read so the UI
      // doesn't lag the click. The list query's pages live as
      // InfiniteData; iterate every page and rewrite items.
      const previous = queryClient.getQueryData<InfiniteData<NotificationsListResponse>>(
        NOTIFICATIONS_QUERY_KEY
      );
      if (previous !== undefined) {
        queryClient.setQueryData<InfiniteData<NotificationsListResponse>>(
          NOTIFICATIONS_QUERY_KEY,
          {
            ...previous,
            pages: previous.pages.map((page) => ({
              ...page,
              items: page.items.map((item) =>
                id === undefined || item.id === id ? { ...item, read: true } : item
              ),
            })),
          }
        );
      }
      return { previous };
    },

    onSettled: () => {
      // Re-fetch the badges payload so the bell badge reflects the
      // server's authoritative state immediately rather than waiting
      // up to 8s for the adaptive polling interval. The list itself
      // refetches on next dropdown open via stale-time.
      void queryClient.invalidateQueries({ queryKey: BADGES_QUERY_KEY_ROOT });
    },
  });
}
