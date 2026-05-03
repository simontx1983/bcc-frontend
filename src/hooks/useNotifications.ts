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
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";

import {
  getNotifications,
  getUnreadCount,
  markNotificationsRead,
} from "@/lib/api/notifications-endpoints";
import type {
  BccApiError,
  NotificationsListResponse,
  NotificationsMarkReadResponse,
  NotificationsUnreadCountResponse,
} from "@/lib/api/types";

const PAGE_SIZE = 20;
const UNREAD_POLL_MS = 60_000;

export const NOTIFICATIONS_QUERY_KEY = ["me", "notifications"] as const;
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

export function useUnreadCount({ enabled }: UseNotificationsOptions) {
  return useQuery<NotificationsUnreadCountResponse>({
    queryKey: UNREAD_COUNT_QUERY_KEY,
    queryFn: ({ signal }) => getUnreadCount(signal),
    enabled,
    staleTime: UNREAD_POLL_MS / 2,
    refetchInterval: enabled ? UNREAD_POLL_MS : false,
    refetchOnWindowFocus: true,
  });
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
      // Always re-fetch the unread count so the badge reflects the
      // server's authoritative state. The list re-fetches on next
      // dropdown open via stale-time.
      void queryClient.invalidateQueries({ queryKey: UNREAD_COUNT_QUERY_KEY });
    },
  });
}
