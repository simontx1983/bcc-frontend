"use client";

/**
 * Hooks for /me/privacy (§K2 settings).
 *
 * - `useMyPrivacy` — query hook reading all 8 flags. Server is the
 *   source of truth; we don't mirror in localStorage.
 * - `useUpdateMyPrivacy` — mutation hook for partial PATCH updates.
 *   On success, seeds the query cache with the server's post-write
 *   state so the form re-renders without a refetch.
 *
 * The mutation does an optimistic update (per-toggle UX is a tap, not
 * a form submit) so the switch flips instantly. On error we roll back
 * by re-seeding the cache from the previous snapshot.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { getMyPrivacy, updateMyPrivacy } from "@/lib/api/privacy-endpoints";
import type {
  BccApiError,
  MyPrivacyPatch,
  MyPrivacySettings,
} from "@/lib/api/types";

const QUERY_KEY = ["me", "privacy"] as const;

export function useMyPrivacy() {
  return useQuery<MyPrivacySettings, BccApiError>({
    queryKey: QUERY_KEY,
    queryFn: ({ signal }) => getMyPrivacy(signal),
    // Fresh-on-focus is fine here — privacy state changes rarely and
    // the form is only on /settings/privacy. Default staleTime keeps
    // it out of the inflight queue when the tab is hidden.
    staleTime: 30_000,
  });
}

export function useUpdateMyPrivacy(
  options: Omit<
    UseMutationOptions<MyPrivacySettings, BccApiError, MyPrivacyPatch, { previous: MyPrivacySettings | undefined }>,
    "mutationFn" | "onMutate" | "onError" | "onSuccess"
  > = {}
) {
  const queryClient = useQueryClient();

  return useMutation<MyPrivacySettings, BccApiError, MyPrivacyPatch, { previous: MyPrivacySettings | undefined }>({
    mutationFn: (patch) => updateMyPrivacy(patch),
    onMutate: async (patch) => {
      // Cancel inflight reads so they don't clobber the optimistic state.
      await queryClient.cancelQueries({ queryKey: QUERY_KEY });
      const previous = queryClient.getQueryData<MyPrivacySettings>(QUERY_KEY);
      if (previous !== undefined) {
        queryClient.setQueryData<MyPrivacySettings>(QUERY_KEY, {
          ...previous,
          ...patch,
        });
      }
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<MyPrivacySettings>(QUERY_KEY, context.previous);
      }
    },
    onSuccess: (data) => {
      // Server's post-write state is canonical — re-seed.
      queryClient.setQueryData<MyPrivacySettings>(QUERY_KEY, data);
    },
    ...options,
  });
}
