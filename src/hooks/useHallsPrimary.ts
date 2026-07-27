"use client";

/**
 * useHallsPrimary — Hall membership mutation hooks (join, leave,
 * set primary, clear primary).
 *
 * No cache surgery: the /halls directory and /halls/[slug] detail
 * pages are server components, not React Query consumers. The toggle
 * component calls `router.refresh()` in `onSuccess` to re-render
 * affected server surfaces with the fresh `viewer_membership` block.
 *
 * Auth + membership gating happens server-side. Errors come back as
 * typed BccApiErrors:
 *   - bcc_unauthorized — no session
 *   - bcc_forbidden    — viewer isn't a member (set-primary) OR Hall
 *                        doesn't accept open membership (join, closed)
 *   - bcc_not_found    — groupId doesn't match a BCC Hall
 *   - bcc_unavailable  — PeepSo deactivated server-side
 *
 * Idempotency:
 *   - Set primary: re-setting the same primary is a no-op success.
 *   - Clear primary: clearing when nothing is set is a no-op success.
 *   - Join: re-joining an active Hall is a no-op success.
 *   - Leave: leaving as a non-member is a no-op success. If leaving
 *     the user's primary Hall, the server atomically clears the
 *     primary pointer (`primary_cleared: true` in the response).
 */

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";

import {
  clearPrimaryHall,
  joinHall,
  leaveHall,
  setPrimaryHall,
} from "@/lib/api/halls-endpoints";
import type {
  BccApiError,
  ClearPrimaryHallResponse,
  JoinHallResponse,
  LeaveHallResponse,
  SetPrimaryHallResponse,
} from "@/lib/api/types";

export function useSetPrimaryHallMutation(
  options: Omit<
    UseMutationOptions<SetPrimaryHallResponse, BccApiError, number>,
    "mutationFn"
  > = {}
) {
  return useMutation<SetPrimaryHallResponse, BccApiError, number>({
    mutationFn: (groupId) => setPrimaryHall(groupId),
    ...options,
  });
}

export function useClearPrimaryHallMutation(
  options: Omit<
    UseMutationOptions<ClearPrimaryHallResponse, BccApiError, void>,
    "mutationFn"
  > = {}
) {
  return useMutation<ClearPrimaryHallResponse, BccApiError, void>({
    mutationFn: () => clearPrimaryHall(),
    ...options,
  });
}

export function useJoinHallMutation(
  options: Omit<
    UseMutationOptions<JoinHallResponse, BccApiError, number>,
    "mutationFn"
  > = {}
) {
  return useMutation<JoinHallResponse, BccApiError, number>({
    mutationFn: (groupId) => joinHall(groupId),
    ...options,
  });
}

export function useLeaveHallMutation(
  options: Omit<
    UseMutationOptions<LeaveHallResponse, BccApiError, number>,
    "mutationFn"
  > = {}
) {
  return useMutation<LeaveHallResponse, BccApiError, number>({
    mutationFn: (groupId) => leaveHall(groupId),
    ...options,
  });
}
