"use client";

/**
 * §V2 Phase 2.5 — React Query hooks for /me/profile/fields.
 *
 *   - useProfileFields                : query (schema + values + visibility)
 *   - useUpdateProfileFieldValue      : mutation, replaces field in cache
 *   - useUpdateProfileFieldVisibility : mutation, replaces field in cache
 *
 * The query cache is keyed at PROFILE_FIELDS_QUERY_KEY; mutations rewrite
 * the matching entry in `fields[]` rather than invalidating, so the form
 * stays editable without a refetch flicker.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  getProfileFields,
  patchProfileFieldValue,
  patchProfileFieldVisibility,
  type ProfileField,
  type ProfileFieldVisibility,
  type ProfileFieldsResponse,
} from "@/lib/api/profile-fields-endpoints";
import type { BccApiError } from "@/lib/api/types";

export const PROFILE_FIELDS_QUERY_KEY = ["bcc", "me", "profile-fields"] as const;

export function useProfileFields(
  options: Omit<
    UseQueryOptions<ProfileFieldsResponse, BccApiError | Error>,
    "queryKey" | "queryFn"
  > = {},
) {
  return useQuery<ProfileFieldsResponse, BccApiError | Error>({
    queryKey: PROFILE_FIELDS_QUERY_KEY,
    queryFn: ({ signal }) => getProfileFields(signal),
    staleTime: 30_000,
    ...options,
  });
}

interface ValueMutationVars {
  key: string;
  value: string | string[];
}

export function useUpdateProfileFieldValue(
  options: Omit<
    UseMutationOptions<ProfileField, BccApiError | Error, ValueMutationVars>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: ProfileField) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<ProfileField, BccApiError | Error, ValueMutationVars>({
    mutationFn: ({ key, value }) => patchProfileFieldValue(key, value),
    onSuccess: (data) => {
      mergeFieldIntoCache(queryClient, data);
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}

interface VisibilityMutationVars {
  key: string;
  visibility: ProfileFieldVisibility;
}

export function useUpdateProfileFieldVisibility(
  options: Omit<
    UseMutationOptions<ProfileField, BccApiError | Error, VisibilityMutationVars>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: ProfileField) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<ProfileField, BccApiError | Error, VisibilityMutationVars>({
    mutationFn: ({ key, visibility }) => patchProfileFieldVisibility(key, visibility),
    onSuccess: (data) => {
      mergeFieldIntoCache(queryClient, data);
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}

function mergeFieldIntoCache(
  queryClient: ReturnType<typeof useQueryClient>,
  updated: ProfileField,
): void {
  queryClient.setQueryData<ProfileFieldsResponse>(
    PROFILE_FIELDS_QUERY_KEY,
    (prev) => {
      if (!prev) return prev;
      const fields = prev.fields.map((f) =>
        f.key === updated.key ? updated : f,
      );
      return { ...prev, fields };
    },
  );
}
