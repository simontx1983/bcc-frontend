"use client";

/**
 * Hooks for /me/holder-groups (§4.7.1).
 *
 *   - useMyHolderGroups            — query: joined / eligible / opted_out buckets
 *   - useJoinHolderGroupMutation   — mutation: POST /:id/join
 *   - useLeaveHolderGroupMutation  — mutation: POST /:id/leave
 *   - useHolderGroupPreferences    — query: auto_join flag
 *   - useUpdateHolderGroupPreferences — mutation: PATCH preferences (optimistic)
 *
 * Cache invalidation strategy:
 *   - join / leave invalidate the list query so the row re-buckets
 *     (eligible → joined on join, joined → opted_out on leave).
 *   - PATCH preferences with `auto_join: true` runs a server-side
 *     reconcile sweep — we ALSO invalidate the list query because
 *     newly-joined rows must show up immediately.
 *
 * Optimistic updates:
 *   - PATCH preferences flips the toggle instantly with rollback on
 *     error (mirrors useMyPrivacy) — single boolean, single field.
 *   - join / leave do NOT optimistically re-bucket the row. Server can
 *     reject join (NFT ownership changed mid-flight, opt-out cooldown
 *     hit, chain RPC failure) and we want the user to see the actual
 *     server decision, not a flicker. Caller is expected to provide
 *     button-level pending state (see useState pattern in BlocksList).
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  getHolderGroupPreferences,
  getMyHolderGroups,
  joinHolderGroup,
  leaveHolderGroup,
  updateHolderGroupPreferences,
} from "@/lib/api/holder-groups-endpoints";
import type {
  BccApiError,
  HolderGroupPreferences,
  HolderGroupPreferencesPatch,
  HolderGroupPreferencesUpdateResponse,
  JoinHolderGroupResponse,
  LeaveHolderGroupResponse,
  MyHolderGroupsResponse,
} from "@/lib/api/types";

export const HOLDER_GROUPS_QUERY_KEY = ["me", "holder-groups"] as const;
export const HOLDER_GROUPS_PREFS_QUERY_KEY = [
  "me",
  "holder-groups",
  "preferences",
] as const;

// ─────────────────────────────────────────────────────────────────────
// Queries
// ─────────────────────────────────────────────────────────────────────

export function useMyHolderGroups() {
  return useQuery<MyHolderGroupsResponse, BccApiError>({
    queryKey: HOLDER_GROUPS_QUERY_KEY,
    queryFn: ({ signal }) => getMyHolderGroups(signal),
    // Membership state is per-viewer + private (Cache-Control: no-store).
    // 30s staleTime suppresses refetch storms when the user toggles the
    // tab; mutations invalidate explicitly anyway.
    staleTime: 30_000,
  });
}

export function useHolderGroupPreferences() {
  return useQuery<HolderGroupPreferences, BccApiError>({
    queryKey: HOLDER_GROUPS_PREFS_QUERY_KEY,
    queryFn: ({ signal }) => getHolderGroupPreferences(signal),
    staleTime: 30_000,
  });
}

// ─────────────────────────────────────────────────────────────────────
// Mutations
// ─────────────────────────────────────────────────────────────────────

export function useJoinHolderGroupMutation(
  options: Omit<
    UseMutationOptions<JoinHolderGroupResponse, BccApiError, number>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: JoinHolderGroupResponse, groupId: number) => void;
  } = {}
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<JoinHolderGroupResponse, BccApiError, number>({
    mutationFn: (groupId) => joinHolderGroup(groupId),
    onSuccess: (data, groupId) => {
      // Re-bucket: eligible → joined.
      void queryClient.invalidateQueries({ queryKey: HOLDER_GROUPS_QUERY_KEY });
      callerOnSuccess?.(data, groupId);
    },
    ...rest,
  });
}

export function useLeaveHolderGroupMutation(
  options: Omit<
    UseMutationOptions<LeaveHolderGroupResponse, BccApiError, number>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: LeaveHolderGroupResponse, groupId: number) => void;
  } = {}
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<LeaveHolderGroupResponse, BccApiError, number>({
    mutationFn: (groupId) => leaveHolderGroup(groupId),
    onSuccess: (data, groupId) => {
      // Re-bucket: joined → opted_out.
      void queryClient.invalidateQueries({ queryKey: HOLDER_GROUPS_QUERY_KEY });
      callerOnSuccess?.(data, groupId);
    },
    ...rest,
  });
}

/**
 * Toggles the `auto_join` preference with optimistic update + rollback
 * (mirrors useUpdateMyPrivacy). When toggling ON, the server runs a
 * synchronous reconcile sweep — we invalidate the holder-groups list so
 * any freshly-joined rows show up immediately.
 */
export function useUpdateHolderGroupPreferences(
  options: Omit<
    UseMutationOptions<
      HolderGroupPreferencesUpdateResponse,
      BccApiError,
      HolderGroupPreferencesPatch,
      { previous: HolderGroupPreferences | undefined }
    >,
    "mutationFn" | "onMutate" | "onError" | "onSuccess"
  > = {}
) {
  const queryClient = useQueryClient();

  return useMutation<
    HolderGroupPreferencesUpdateResponse,
    BccApiError,
    HolderGroupPreferencesPatch,
    { previous: HolderGroupPreferences | undefined }
  >({
    mutationFn: (patch) => updateHolderGroupPreferences(patch),
    onMutate: async (patch) => {
      await queryClient.cancelQueries({
        queryKey: HOLDER_GROUPS_PREFS_QUERY_KEY,
      });
      const previous = queryClient.getQueryData<HolderGroupPreferences>(
        HOLDER_GROUPS_PREFS_QUERY_KEY
      );
      queryClient.setQueryData<HolderGroupPreferences>(
        HOLDER_GROUPS_PREFS_QUERY_KEY,
        { auto_join: patch.auto_join }
      );
      return { previous };
    },
    onError: (_err, _patch, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData<HolderGroupPreferences>(
          HOLDER_GROUPS_PREFS_QUERY_KEY,
          context.previous
        );
      }
    },
    onSuccess: (data) => {
      // Server's post-write state is canonical.
      queryClient.setQueryData<HolderGroupPreferences>(
        HOLDER_GROUPS_PREFS_QUERY_KEY,
        { auto_join: data.auto_join }
      );
      // Auto-join ON triggers an immediate reconcile sweep server-side;
      // refresh the bucketed list so newly-joined rows appear without
      // a manual refetch.
      if (data.auto_join && data.reconciled.joined > 0) {
        void queryClient.invalidateQueries({
          queryKey: HOLDER_GROUPS_QUERY_KEY,
        });
      }
    },
    ...options,
  });
}
