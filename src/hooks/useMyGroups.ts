"use client";

/**
 * Hooks for /me/groups (§4.7.3 Plain Group Membership).
 *
 *   - useJoinPlainGroupMutation  — POST /me/groups/:id/join
 *   - useLeavePlainGroupMutation — POST /me/groups/:id/leave
 *
 * Mirrors the `useLocalsPrimary` pattern — no cache surgery, the
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

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";

import {
  createPlainGroup,
  joinPlainGroup,
  leavePlainGroup,
} from "@/lib/api/my-groups-endpoints";
import type {
  BccApiError,
  CreatePlainGroupRequest,
  CreatePlainGroupResponse,
  JoinPlainGroupResponse,
  LeavePlainGroupResponse,
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
