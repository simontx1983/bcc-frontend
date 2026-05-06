"use client";

/**
 * §V2 Phase 2.5 — React Query hooks for /me/profile-prefs.
 *
 *   - useProfilePrefs       : query
 *   - useUpdateProfilePrefs : mutation, replaces cache on success
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  getProfilePrefs,
  patchProfilePrefs,
  type PatchProfilePrefsBody,
  type ProfilePrefs,
} from "@/lib/api/profile-prefs-endpoints";
import type { BccApiError } from "@/lib/api/types";

export const PROFILE_PREFS_QUERY_KEY = ["bcc", "me", "profile-prefs"] as const;

export function useProfilePrefs(
  options: Omit<
    UseQueryOptions<ProfilePrefs, BccApiError | Error>,
    "queryKey" | "queryFn"
  > = {},
) {
  return useQuery<ProfilePrefs, BccApiError | Error>({
    queryKey: PROFILE_PREFS_QUERY_KEY,
    queryFn: ({ signal }) => getProfilePrefs(signal),
    staleTime: 30_000,
    ...options,
  });
}

export function useUpdateProfilePrefs(
  options: Omit<
    UseMutationOptions<ProfilePrefs, BccApiError | Error, PatchProfilePrefsBody>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: ProfilePrefs) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<ProfilePrefs, BccApiError | Error, PatchProfilePrefsBody>({
    mutationFn: (body) => patchProfilePrefs(body),
    onSuccess: (data) => {
      queryClient.setQueryData<ProfilePrefs>(PROFILE_PREFS_QUERY_KEY, data);
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}
