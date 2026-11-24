"use client";

/**
 * Hooks for /me/groups (§4.7.3 Plain Group Membership).
 *
 *   - useJoinPlainGroupMutation  — POST /me/groups/:id/join
 *   - useLeavePlainGroupMutation — POST /me/groups/:id/leave
 *   - F-272 (closed / secret groups): useRequestJoinGroupMutation,
 *     useCancelJoinRequestMutation, useAcceptGroupInviteMutation,
 *     useDeclineGroupInviteMutation, and the useMyGroupInvites list
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
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  type InfiniteData,
  type QueryKey,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { useSession } from "next-auth/react";

import { GROUP_MEMBERS_QUERY_KEY_ROOT } from "@/hooks/useGroupMembers";
import { USER_GROUPS_QUERY_KEY_ROOT } from "@/hooks/useUserActivity";
import {
  acceptGroupInvite,
  approveJoinRequest,
  cancelJoinRequest,
  createPlainGroup,
  declineGroupInvite,
  denyJoinRequest,
  getGroupInvites,
  getGroupJoinRequests,
  getMyGroupInvites,
  inviteToGroup,
  joinPlainGroup,
  leavePlainGroup,
  requestJoinGroup,
  revokeGroupInvite,
  setGroupPostPolicy,
  transferGroupOwnership,
} from "@/lib/api/my-groups-endpoints";
import { invalidateGroupContent, useGroupContentRefresh } from "@/hooks/groupContentCache";
import {
  BccApiError,
  type CreatePlainGroupRequest,
  type CreatePlainGroupResponse,
  type GroupJoinRequestItem,
  type GroupMembershipChangeResponse,
  type GroupMembershipDecisionResponse,
  type GroupOutstandingInviteItem,
  type GroupPendingListResponse,
  type JoinPlainGroupResponse,
  type MyGroupInvitesResponse,
  type LeavePlainGroupResponse,
  type SetGroupPostPolicyResponse,
  type TransferCommunityResponse,
} from "@/lib/api/types";

export function useJoinPlainGroupMutation(
  options: Omit<
    UseMutationOptions<JoinPlainGroupResponse, BccApiError, number>,
    "mutationFn"
  > = {}
) {
  const withRefresh = useGroupContentRefresh(options);
  return useMutation<JoinPlainGroupResponse, BccApiError, number>({
    mutationFn: (groupId) => joinPlainGroup(groupId),
    ...withRefresh,
  });
}

export function useLeavePlainGroupMutation(
  options: Omit<
    UseMutationOptions<LeavePlainGroupResponse, BccApiError, number>,
    "mutationFn"
  > = {}
) {
  const withRefresh = useGroupContentRefresh(options);
  return useMutation<LeavePlainGroupResponse, BccApiError, number>({
    mutationFn: (groupId) => leavePlainGroup(groupId),
    ...withRefresh,
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

// ─────────────────────────────────────────────────────────────────────
// F-272 — closed-group requests and invitations (viewer side).
//
// Each write refreshes the group's server-rendered page through the same
// `useGroupContentRefresh` the join/leave hooks use, so the strip shows
// the new status (Requested, Member, …) from the server. Accept / decline
// also re-read the caller's invitation list.
// ─────────────────────────────────────────────────────────────────────

export const MY_GROUP_INVITES_QUERY_KEY = ["me", "group-invites"] as const;

type MembershipMutationOptions = Omit<
  UseMutationOptions<GroupMembershipChangeResponse, BccApiError, number>,
  "mutationFn"
>;

export function useRequestJoinGroupMutation(options: MembershipMutationOptions = {}) {
  const withRefresh = useGroupContentRefresh(options);
  return useMutation<GroupMembershipChangeResponse, BccApiError, number>({
    mutationFn: (groupId) => requestJoinGroup(groupId),
    ...withRefresh,
  });
}

export function useCancelJoinRequestMutation(options: MembershipMutationOptions = {}) {
  const withRefresh = useGroupContentRefresh(options);
  return useMutation<GroupMembershipChangeResponse, BccApiError, number>({
    mutationFn: (groupId) => cancelJoinRequest(groupId),
    ...withRefresh,
  });
}

function useInviteAnswerMutation(
  answer: (groupId: number) => Promise<GroupMembershipChangeResponse>,
  options: MembershipMutationOptions,
) {
  const queryClient = useQueryClient();
  const withRefresh = useGroupContentRefresh(options);
  return useMutation<GroupMembershipChangeResponse, BccApiError, number>({
    mutationFn: (groupId) => answer(groupId),
    ...withRefresh,
    onSettled: (...args) => {
      void queryClient.invalidateQueries({ queryKey: MY_GROUP_INVITES_QUERY_KEY });
      withRefresh.onSettled?.(...args);
    },
  });
}

export function useAcceptGroupInviteMutation(options: MembershipMutationOptions = {}) {
  return useInviteAnswerMutation(acceptGroupInvite, options);
}

export function useDeclineGroupInviteMutation(options: MembershipMutationOptions = {}) {
  return useInviteAnswerMutation(declineGroupInvite, options);
}

const MY_GROUP_INVITES_PAGE = 50;

/**
 * GET /me/group-invites — signed-in only (it is a /me route). Paged by
 * offset; the list offers "Show more" while `has_more` is true.
 *
 * A 404 means the route itself does not exist (a backend without F-272),
 * not a failure the viewer can retry: it reads as "no invitations", so a
 * frontend deployed ahead of its backend degrades to nothing instead of
 * an error on every /communities visit.
 */
export function useMyGroupInvites() {
  const { status } = useSession();
  return useInfiniteQuery<
    MyGroupInvitesResponse,
    BccApiError,
    InfiniteData<MyGroupInvitesResponse>,
    QueryKey,
    number
  >({
    queryKey: MY_GROUP_INVITES_QUERY_KEY,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }) => {
      try {
        return await getMyGroupInvites({ offset: pageParam, limit: MY_GROUP_INVITES_PAGE }, signal);
      } catch (err) {
        if (err instanceof BccApiError && err.status === 404) {
          return { items: [], pagination: { offset: pageParam, limit: MY_GROUP_INVITES_PAGE, has_more: false } };
        }
        throw err;
      }
    },
    getNextPageParam: (last) =>
      last.pagination.has_more ? last.pagination.offset + last.items.length : undefined,
    enabled: status === "authenticated",
  });
}

// ─────────────────────────────────────────────────────────────────────
// F-272 (b) — the owner / manager / site-admin side: a group's pending
// requests and outstanding invitations, and the four decisions on them.
//
// The lists are only ever enabled for a viewer the group detail marks as
// a decider (every route 403s anyone else). Each decision re-reads its
// list; an approval also re-reads the roster (a new member).
// ─────────────────────────────────────────────────────────────────────

export const GROUP_JOIN_REQUESTS_QUERY_KEY_ROOT = ["me", "groups", "requests"] as const;
export const GROUP_INVITES_QUERY_KEY_ROOT = ["me", "groups", "invites"] as const;

const PENDING_PAGE = 24;

function usePendingList<T>(
  root: readonly string[],
  groupId: number,
  fetchPage: (
    groupId: number,
    params: { offset: number; limit: number },
    signal: AbortSignal,
  ) => Promise<GroupPendingListResponse<T>>,
  enabled: boolean,
) {
  return useInfiniteQuery<
    GroupPendingListResponse<T>,
    BccApiError,
    InfiniteData<GroupPendingListResponse<T>>,
    QueryKey,
    number
  >({
    queryKey: [...root, groupId],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => fetchPage(groupId, { offset: pageParam, limit: PENDING_PAGE }, signal),
    // has_more is counted over raw rows (deleted accounts are skipped from
    // items), so the next page starts at offset + limit.
    getNextPageParam: (last) =>
      last.pagination.has_more ? last.pagination.offset + last.pagination.limit : undefined,
    enabled: enabled && groupId > 0,
  });
}

/** GET /me/groups/:id/requests — enable only for a decider. */
export function useGroupJoinRequests(groupId: number, enabled: boolean) {
  return usePendingList<GroupJoinRequestItem>(
    GROUP_JOIN_REQUESTS_QUERY_KEY_ROOT,
    groupId,
    getGroupJoinRequests,
    enabled,
  );
}

/** GET /me/groups/:id/invites — enable only for a decider. */
export function useGroupInvites(groupId: number, enabled: boolean) {
  return usePendingList<GroupOutstandingInviteItem>(
    GROUP_INVITES_QUERY_KEY_ROOT,
    groupId,
    getGroupInvites,
    enabled,
  );
}

export interface MembershipDecisionVars {
  groupId: number;
  userId: number;
}

type DecisionMutationOptions = Omit<
  UseMutationOptions<GroupMembershipDecisionResponse, BccApiError, MembershipDecisionVars>,
  "mutationFn"
>;

function useDecisionMutation(
  run: (groupId: number, userId: number) => Promise<GroupMembershipDecisionResponse>,
  roots: ReadonlyArray<readonly string[]>,
  refreshesRoster: boolean,
  options: DecisionMutationOptions,
) {
  const queryClient = useQueryClient();
  return useMutation<GroupMembershipDecisionResponse, BccApiError, MembershipDecisionVars>({
    mutationFn: ({ groupId, userId }) => run(groupId, userId),
    ...options,
    // Settled, not success: a 409 ("no longer pending") means the list is
    // stale too, so it is re-read either way.
    onSettled: (data, error, vars, ...rest) => {
      for (const root of roots) {
        void queryClient.invalidateQueries({ queryKey: [...root, vars.groupId] });
      }
      if (refreshesRoster && error === null) {
        invalidateGroupContent(queryClient, vars.groupId);
      }
      options.onSettled?.(data, error, vars, ...rest);
    },
  });
}

/** POST …/requests/:user_id/approve — the requester becomes a member. */
export function useApproveJoinRequestMutation(options: DecisionMutationOptions = {}) {
  return useDecisionMutation(approveJoinRequest, [GROUP_JOIN_REQUESTS_QUERY_KEY_ROOT], true, options);
}

/** POST …/requests/:user_id/deny — silent; a 7-day wait before they may ask again. */
export function useDenyJoinRequestMutation(options: DecisionMutationOptions = {}) {
  return useDecisionMutation(denyJoinRequest, [GROUP_JOIN_REQUESTS_QUERY_KEY_ROOT], false, options);
}

/** POST …/invites — invite a member to a closed or secret group. */
export function useInviteToGroupMutation(options: DecisionMutationOptions = {}) {
  return useDecisionMutation(inviteToGroup, [GROUP_INVITES_QUERY_KEY_ROOT], false, options);
}

/** POST …/invites/:user_id/revoke — withdraw an outstanding invitation. */
export function useRevokeGroupInviteMutation(options: DecisionMutationOptions = {}) {
  return useDecisionMutation(revokeGroupInvite, [GROUP_INVITES_QUERY_KEY_ROOT], false, options);
}
