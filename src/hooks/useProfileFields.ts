"use client";

/**
 * §V2 Phase 2.5 — React Query hooks for /me/profile/fields.
 *
 *   - useProfileFields                : query (schema + values + visibility)
 *   - useUpdateProfileFieldValue      : mutation, merges `value` into cache
 *   - useUpdateProfileFieldVisibility : mutation, merges `visibility` into cache
 *
 * The query cache is keyed at PROFILE_FIELDS_QUERY_KEY; mutations rewrite
 * the matching entry in `fields[]` rather than invalidating, so the form
 * stays editable without a refetch flicker.
 *
 * ## Why each mutation merges ONE property and not the response object
 *
 * A row can save its value and its visibility at the same time — two
 * independent requests. Server-side they are disjoint writes
 * (`$field->save()` vs `$field->save_acc()`), but BOTH endpoints reload
 * the field afterwards and return the SAME full `buildItem()` payload,
 * so each response carries a snapshot of the other property taken at its
 * own reload instant.
 *
 * This merge used to replace the whole field object, which made the last
 * response to arrive the winner. If the value request reloaded before the
 * visibility write committed, and its response landed second, the cache
 * reverted `visibility` to the pre-save value — while the database kept
 * the new one. The row then re-reported itself dirty for a change that
 * had actually persisted.
 *
 * Merging only the property each mutation owns makes arrival order
 * irrelevant: both orders converge on the server-confirmed state. The
 * remaining ten properties are admin-catalogue schema that neither
 * mutation can change; they refresh on the next `getProfileFields`.
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
      // `value` only. `data.visibility` is this request's own snapshot and
      // may predate a concurrent visibility save.
      mergeFieldProperty(queryClient, data.key, "value", data.value);
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
      // `visibility` only — mirror of the value hook above.
      mergeFieldProperty(queryClient, data.key, "visibility", data.visibility);
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}

/**
 * Compare two field values. `select_multi` carries `string[]`, so a
 * reference check would report every response as a change and churn the
 * cache identity for nothing.
 */
export function profileFieldValuesEqual(
  a: string | string[],
  b: string | string[],
): boolean {
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((v, i) => v === sortedB[i]);
  }
  return false;
}

/**
 * Write exactly one property of one field. See the header note — this is
 * the whole reason the two mutations cannot clobber each other.
 */
function mergeFieldProperty<K extends "value" | "visibility">(
  queryClient: ReturnType<typeof useQueryClient>,
  key: string,
  prop: K,
  next: ProfileField[K],
): void {
  queryClient.setQueryData<ProfileFieldsResponse>(
    PROFILE_FIELDS_QUERY_KEY,
    (prev) => {
      if (!prev) return prev;
      let changed = false;
      const fields = prev.fields.map((f) => {
        if (f.key !== key) return f;
        const same =
          prop === "value"
            ? profileFieldValuesEqual(f.value, next as ProfileField["value"])
            : f[prop] === next;
        if (same) return f;
        changed = true;
        return { ...f, [prop]: next };
      });
      // Returning `prev` unchanged keeps the drafts' sync effects from
      // firing on a no-op response.
      return changed ? { ...prev, fields } : prev;
    },
  );
}
