"use client";

/**
 * Hooks for delegator communities.
 *
 *   - useJoinValidatorGroupMutation   — mutation: POST /me/validator-groups/:id/join
 *   - useLeaveValidatorGroupMutation  — mutation: POST /me/validator-groups/:id/leave
 *   - useCreateDelegatorGroupMutation — mutation: POST /pages/:id/delegator-group
 *   - useUpdateDelegatorGroupMutation — mutation: PATCH /pages/:id/delegator-group
 *
 * None of these update anything optimistically: the join is a live
 * on-chain check, and every surface using them re-reads server truth on
 * success (router.refresh or its own query invalidation).
 */

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";

import { humanizeCode } from "@/lib/api/errors";
import {
  createDelegatorGroup,
  joinValidatorGroup,
  leaveValidatorGroup,
  updateDelegatorGroup,
} from "@/lib/api/validator-groups-endpoints";
import { BccApiError } from "@/lib/api/types";
import type {
  CreateDelegatorGroupRequest,
  DelegatorGroupResponse,
  JoinValidatorGroupResponse,
  LeaveValidatorGroupResponse,
  UpdateDelegatorGroupRequest,
} from "@/lib/api/types";

interface CreateDelegatorGroupVariables {
  pageId: number;
  request: CreateDelegatorGroupRequest;
}

interface UpdateDelegatorGroupVariables {
  pageId: number;
  request: UpdateDelegatorGroupRequest;
}

export function useJoinValidatorGroupMutation(
  options: Omit<
    UseMutationOptions<JoinValidatorGroupResponse, BccApiError, number>,
    "mutationFn"
  > = {}
) {
  return useMutation<JoinValidatorGroupResponse, BccApiError, number>({
    mutationFn: (groupId) => joinValidatorGroup(groupId),
    ...options,
  });
}

export function useLeaveValidatorGroupMutation(
  options: Omit<
    UseMutationOptions<LeaveValidatorGroupResponse, BccApiError, number>,
    "mutationFn"
  > = {}
) {
  return useMutation<LeaveValidatorGroupResponse, BccApiError, number>({
    mutationFn: (groupId) => leaveValidatorGroup(groupId),
    ...options,
  });
}

export function useCreateDelegatorGroupMutation(
  options: Omit<
    UseMutationOptions<
      DelegatorGroupResponse,
      BccApiError,
      CreateDelegatorGroupVariables
    >,
    "mutationFn"
  > = {}
) {
  return useMutation<
    DelegatorGroupResponse,
    BccApiError,
    CreateDelegatorGroupVariables
  >({
    mutationFn: ({ pageId, request }) => createDelegatorGroup(pageId, request),
    ...options,
  });
}

export function useUpdateDelegatorGroupMutation(
  options: Omit<
    UseMutationOptions<
      DelegatorGroupResponse,
      BccApiError,
      UpdateDelegatorGroupVariables
    >,
    "mutationFn"
  > = {}
) {
  return useMutation<
    DelegatorGroupResponse,
    BccApiError,
    UpdateDelegatorGroupVariables
  >({
    mutationFn: ({ pageId, request }) => updateDelegatorGroup(pageId, request),
    ...options,
  });
}

/**
 * §γ — copy for the verified join, shared by every surface that fires it.
 * "You don't delegate enough" and "couldn't verify" are different problems
 * with different next steps, so they must never read alike. The cooldown
 * shares `bcc_permission_denied` with too little delegation and is told apart
 * by `data.reason_code`. It covers a moderator's removal as well as a leave.
 */
export function humanizeValidatorJoinError(err: unknown): string {
  if (isJoinCooldown(err)) {
    return "You can't rejoin this group yet because of a recent leave or removal. Try again later.";
  }
  return humanizeCode(
    err,
    {
      bcc_permission_denied:
        "You don't delegate enough to this validator from a linked wallet.",
      bcc_upstream_unavailable:
        "Couldn't verify your delegation right now. Try again in a moment.",
      bcc_rate_limited: "Slow down — too many join attempts. Wait a minute.",
      bcc_unauthorized: "Sign in to join this group.",
      bcc_forbidden: "Your account can't join groups right now.",
    },
    "Couldn't join this group. Try again.",
  );
}

export function isJoinCooldown(err: unknown): boolean {
  return (
    err instanceof BccApiError &&
    err.code === "bcc_permission_denied" &&
    err.data?.["reason_code"] === "opt_out_active"
  );
}
