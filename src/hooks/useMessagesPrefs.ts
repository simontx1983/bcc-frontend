"use client";

/**
 * §V2 Phase 2 — React Query hooks for /me/messages-prefs.
 *
 * Pattern mirrors useNotificationPrefs:
 *   - useMessagesPrefs    : query
 *   - useUpdateMessagesPrefs : mutation that replaces the cache on success
 *
 * Cache key is exported so other consumers can invalidate or seed it.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  getMessagesPrefs,
  patchMessagesPrefs,
  type MessagesPrefs,
  type PatchMessagesPrefsBody,
} from "@/lib/api/messages-prefs-endpoints";
import type { BccApiError } from "@/lib/api/types";

export const MESSAGES_PREFS_QUERY_KEY = ["bcc", "me", "messages-prefs"] as const;

export function useMessagesPrefs(
  options: Omit<
    UseQueryOptions<MessagesPrefs, BccApiError | Error>,
    "queryKey" | "queryFn"
  > = {},
) {
  return useQuery<MessagesPrefs, BccApiError | Error>({
    queryKey: MESSAGES_PREFS_QUERY_KEY,
    queryFn: ({ signal }) => getMessagesPrefs(signal),
    staleTime: 30_000,
    ...options,
  });
}

export function useUpdateMessagesPrefs(
  options: Omit<
    UseMutationOptions<MessagesPrefs, BccApiError | Error, PatchMessagesPrefsBody>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: MessagesPrefs) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<MessagesPrefs, BccApiError | Error, PatchMessagesPrefsBody>({
    mutationFn: (body) => patchMessagesPrefs(body),
    onSuccess: (data) => {
      queryClient.setQueryData<MessagesPrefs>(MESSAGES_PREFS_QUERY_KEY, data);
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}
