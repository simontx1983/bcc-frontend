"use client";

/**
 * useLocalsPrimary — Local membership mutation hooks (join, leave,
 * set primary, clear primary).
 *
 * No cache surgery: the /locals directory and /locals/[slug] detail
 * pages are server components, not React Query consumers. The toggle
 * component calls `router.refresh()` in `onSuccess` to re-render
 * affected server surfaces with the fresh `viewer_membership` block.
 *
 * Auth + membership gating happens server-side. Errors come back as
 * typed BccApiErrors:
 *   - bcc_unauthorized — no session
 *   - bcc_forbidden    — viewer isn't a member (set-primary) OR Local
 *                        doesn't accept open membership (join, closed)
 *   - bcc_not_found    — groupId doesn't match a BCC Local
 *   - bcc_unavailable  — PeepSo deactivated server-side
 *
 * Idempotency:
 *   - Set primary: re-setting the same primary is a no-op success.
 *   - Clear primary: clearing when nothing is set is a no-op success.
 *   - Join: re-joining an active Local is a no-op success.
 *   - Leave: leaving as a non-member is a no-op success. If leaving
 *     the user's primary Local, the server atomically clears the
 *     primary pointer (`primary_cleared: true` in the response).
 */

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";

import {
  clearPrimaryLocal,
  joinLocal,
  leaveLocal,
  setPrimaryLocal,
} from "@/lib/api/locals-endpoints";
import type {
  BccApiError,
  ClearPrimaryLocalResponse,
  JoinLocalResponse,
  LeaveLocalResponse,
  SetPrimaryLocalResponse,
} from "@/lib/api/types";

export function useSetPrimaryLocalMutation(
  options: Omit<
    UseMutationOptions<SetPrimaryLocalResponse, BccApiError, number>,
    "mutationFn"
  > = {}
) {
  return useMutation<SetPrimaryLocalResponse, BccApiError, number>({
    mutationFn: (groupId) => setPrimaryLocal(groupId),
    ...options,
  });
}

export function useClearPrimaryLocalMutation(
  options: Omit<
    UseMutationOptions<ClearPrimaryLocalResponse, BccApiError, void>,
    "mutationFn"
  > = {}
) {
  return useMutation<ClearPrimaryLocalResponse, BccApiError, void>({
    mutationFn: () => clearPrimaryLocal(),
    ...options,
  });
}

export function useJoinLocalMutation(
  options: Omit<
    UseMutationOptions<JoinLocalResponse, BccApiError, number>,
    "mutationFn"
  > = {}
) {
  return useMutation<JoinLocalResponse, BccApiError, number>({
    mutationFn: (groupId) => joinLocal(groupId),
    ...options,
  });
}

export function useLeaveLocalMutation(
  options: Omit<
    UseMutationOptions<LeaveLocalResponse, BccApiError, number>,
    "mutationFn"
  > = {}
) {
  return useMutation<LeaveLocalResponse, BccApiError, number>({
    mutationFn: (groupId) => leaveLocal(groupId),
    ...options,
  });
}
