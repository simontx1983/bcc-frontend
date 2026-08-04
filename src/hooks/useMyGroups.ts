"use client";

/**
 * Hooks for /me/groups (§4.7.3 Plain Group Membership).
 *
 *   - useJoinPlainGroupMutation  — POST /me/groups/:id/join
 *   - useLeavePlainGroupMutation — POST /me/groups/:id/leave
 *
 * Mirrors the `useHallsPrimary` pattern — no cache surgery, the
 * caller drives `router.refresh()` (or component-local re-render) on
 * success. There is no `GET /me/groups` list query in §4.7.3 to
 * invalidate; the discovery list at `/communities` is server-rendered
 * with no per-viewer fields, so a router refresh is sufficient when
 * the surrounding page wants to reflect post-mutation state.
 *
 * Errors come back as typed `BccApiError`. The `message` field is the
 * server-authoritative unlock_hint copy (closed-group / invite-only /
 * owner-cannot-leave) — surface it verbatim, never substitute a
 * generic 403 string.
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { GROUP_MEMBERS_QUERY_KEY_ROOT } from "@/hooks/useGroupMembers";
import { USER_GROUPS_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";
import {
  createPlainGroup,
  joinPlainGroup,
  leavePlainGroup,
  setGroupPostPolicy,
  transferGroupOwnership,
} from "@/lib/api/my-groups-endpoints";
import type {
  BccApiError,
  CreatePlainGroupRequest,
  CreatePlainGroupResponse,
  JoinPlainGroupResponse,
  LeavePlainGroupResponse,
  SetGroupPostPolicyResponse,
  TransferCommunityResponse,
} from "@/lib/api/types";

export function useJoinPlainGroupMutation(
  options: Omit<
    UseMutationOptions<JoinPlainGroupResponse, BccApiError, number>,
    "mutationFn"
  > = {}
) {
  return useMutation<JoinPlainGroupResponse, BccApiError, number>({
    mutationFn: (groupId) => joinPlainGroup(groupId),
    ...options,
  });
}

export function useLeavePlainGroupMutation(
  options: Omit<
    UseMutationOptions<LeavePlainGroupResponse, BccApiError, number>,
    "mutationFn"
  > = {}
) {
  return useMutation<LeavePlainGroupResponse, BccApiError, number>({
    mutationFn: (groupId) => leavePlainGroup(groupId),
    ...options,
  });
}

/**
 * V1.6 — `useCreatePlainGroupMutation`. Same shape as join/leave —
 * caller decides what to do with the response (typically a
 * router.push to /communities and a toast). No cache surgery here;
 * the /communities surface is server-rendered, so the caller drives
 * `router.refresh()` (or just navigates back) to surface the new
 * group in the discovery list.
 */
export function useCreatePlainGroupMutation(
  options: Omit<
    UseMutationOptions<CreatePlainGroupResponse, BccApiError, CreatePlainGroupRequest>,
    "mutationFn"
  > = {}
) {
  return useMutation<CreatePlainGroupResponse, BccApiError, CreatePlainGroupRequest>({
    mutationFn: (request) => createPlainGroup(request),
    ...options,
  });
}

/**
 * Rank Phase 7 (§21.2) — `useTransferGroupOwnershipMutation`. Hands a
 * User-kind community to another active member. On success we
 * invalidate the group's roster (the OWNER role label moves) and every
 * per-user groups panel (ownership is rendered there); the group
 * detail page itself is SSR'd, so the caller drives `router.refresh()`
 * — same division of labor as join/leave.
 */
export function useTransferGroupOwnershipMutation(
  options: Omit<
    UseMutationOptions<
      TransferCommunityResponse,
      BccApiError,
      { groupId: number; toUserId: number }
    >,
    "mutationFn"
  > = {}
) {
  const queryClient = useQueryClient();

  return useMutation<
    TransferCommunityResponse,
    BccApiError,
    { groupId: number; toUserId: number }
  >({
    mutationFn: ({ groupId, toUserId }) =>
      transferGroupOwnership(groupId, toUserId),
    ...options,
    onSuccess: (...args) => {
      const { groupId } = args[1];
      void queryClient.invalidateQueries({
        queryKey: [...GROUP_MEMBERS_QUERY_KEY_ROOT, groupId],
      });
      void queryClient.invalidateQueries({
        queryKey: USER_GROUPS_QUERY_KEY_ROOT,
      });
      return options.onSuccess?.(...args);
    },
  });
}

/**
 * CL-FN06 — `useSetGroupPostPolicyMutation`. Owner/manager control for
 * whether ordinary members may set `visibility=public_all` (syndicate
 * a group post to the main feed). Same shape as join/leave: no cache
 * surgery here; the group page is SSR'd, so the caller renders the
 * response's `public_all_members_enabled` (server truth) and drives
 * `router.refresh()` to re-fetch the detail view-model.
 */
export function useSetGroupPostPolicyMutation(
  options: Omit<
    UseMutationOptions<
      SetGroupPostPolicyResponse,
      BccApiError,
      { groupId: number; publicAllMembers: boolean }
    >,
    "mutationFn"
  > = {}
) {
  return useMutation<
    SetGroupPostPolicyResponse,
    BccApiError,
    { groupId: number; publicAllMembers: boolean }
  >({
    mutationFn: ({ groupId, publicAllMembers }) =>
      setGroupPostPolicy(groupId, publicAllMembers),
    ...options,
  });
}
