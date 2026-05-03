"use client";

/**
 * §I1 — React Query hooks for notification preferences.
 *
 * Single query for the read; single mutation for partial updates.
 * The PATCH response carries the full prefs tree, so the mutation
 * primes the query cache with `setQueryData` instead of forcing a
 * refetch — simpler optimistic UX.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  getNotificationPrefs,
  patchNotificationPrefs,
} from "@/lib/api/notification-prefs-endpoints";
import type {
  BccApiError,
  NotificationPrefs,
  NotificationPrefsPatch,
} from "@/lib/api/types";

export const NOTIFICATION_PREFS_QUERY_KEY = ["me", "notification-prefs"] as const;

export function useNotificationPrefs(enabled: boolean = true) {
  return useQuery<NotificationPrefs, BccApiError>({
    queryKey: NOTIFICATION_PREFS_QUERY_KEY,
    queryFn: ({ signal }) => getNotificationPrefs(signal),
    staleTime: 30_000,
    enabled,
  });
}

export function useUpdateNotificationPrefs(
  options: Omit<
    UseMutationOptions<NotificationPrefs, BccApiError, NotificationPrefsPatch>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: NotificationPrefs) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<NotificationPrefs, BccApiError, NotificationPrefsPatch>({
    mutationFn: (patch) => patchNotificationPrefs(patch),
    onSuccess: (data) => {
      // Server returns the full tree — prime the cache so the next
      // useNotificationPrefs render reflects the change without a
      // round-trip.
      queryClient.setQueryData(NOTIFICATION_PREFS_QUERY_KEY, data);
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}
