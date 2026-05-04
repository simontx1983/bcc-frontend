"use client";

/**
 * §V2 Phase 2 — React Query mutations for /me/profile.
 *
 * Five mutations covering the Profile + account settings surface:
 *   - useUpdateBio       — PATCH bio (text)
 *   - useUploadAvatar    — POST multipart avatar
 *   - useDeleteAvatar    — DELETE avatar (revert to default)
 *   - useUploadCover     — POST multipart cover
 *   - useDeleteCover     — DELETE cover
 *
 * Each mutation returns the full updated `MemberProfile` so the caller
 * can swap its local state directly without a separate refetch. There
 * is no client-side query key for the profile (the settings page reads
 * the initial state from the server component); after a successful
 * mutation, callers typically combine `mutation.data` (immediate UI)
 * with `router.refresh()` (rehydrate server props for header avatar etc).
 */

import { useMutation, type UseMutationOptions } from "@tanstack/react-query";

import {
  patchProfile,
  uploadAvatar,
  deleteAvatar,
  uploadCover,
  deleteCover,
  patchCoverPosition,
  type CoverPosition,
  type PatchProfileBody,
} from "@/lib/api/profile-endpoints";
import type { BccApiError, MemberProfile } from "@/lib/api/types";

export function useUpdateBio(
  options: Omit<
    UseMutationOptions<MemberProfile, BccApiError | Error, PatchProfileBody>,
    "mutationFn"
  > = {}
) {
  return useMutation<MemberProfile, BccApiError | Error, PatchProfileBody>({
    mutationFn: (body) => patchProfile(body),
    ...options,
  });
}

export function useUploadAvatar(
  options: Omit<
    UseMutationOptions<MemberProfile, BccApiError | Error, File>,
    "mutationFn"
  > = {}
) {
  return useMutation<MemberProfile, BccApiError | Error, File>({
    mutationFn: (file) => uploadAvatar(file),
    ...options,
  });
}

export function useDeleteAvatar(
  options: Omit<
    UseMutationOptions<MemberProfile, BccApiError | Error, void>,
    "mutationFn"
  > = {}
) {
  return useMutation<MemberProfile, BccApiError | Error, void>({
    mutationFn: () => deleteAvatar(),
    ...options,
  });
}

export function useUploadCover(
  options: Omit<
    UseMutationOptions<MemberProfile, BccApiError | Error, File>,
    "mutationFn"
  > = {}
) {
  return useMutation<MemberProfile, BccApiError | Error, File>({
    mutationFn: (file) => uploadCover(file),
    ...options,
  });
}

export function useDeleteCover(
  options: Omit<
    UseMutationOptions<MemberProfile, BccApiError | Error, void>,
    "mutationFn"
  > = {}
) {
  return useMutation<MemberProfile, BccApiError | Error, void>({
    mutationFn: () => deleteCover(),
    ...options,
  });
}

export function useUpdateCoverPosition(
  options: Omit<
    UseMutationOptions<MemberProfile, BccApiError | Error, CoverPosition>,
    "mutationFn"
  > = {}
) {
  return useMutation<MemberProfile, BccApiError | Error, CoverPosition>({
    mutationFn: (position) => patchCoverPosition(position),
    ...options,
  });
}
