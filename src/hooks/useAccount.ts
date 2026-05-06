"use client";

/**
 * §V2 Phase 2.5 — React Query mutations for /me/account.
 *
 *   - useChangeAccountEmail
 *   - useChangeAccountPassword
 *   - useDeleteAccount
 *
 * No cached resource here — each mutation is a one-shot, side-effecting
 * call. After deleteAccount() succeeds, the auth cookie is gone, so the
 * caller should redirect to logout_url instead of touching React Query.
 */

import {
  useMutation,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  deleteAccount,
  patchAccountEmail,
  patchAccountPassword,
  type DeleteAccountBody,
  type DeleteAccountResponse,
  type PatchAccountEmailBody,
  type PatchAccountEmailResponse,
  type PatchAccountPasswordBody,
  type PatchAccountPasswordResponse,
} from "@/lib/api/account-endpoints";
import type { BccApiError } from "@/lib/api/types";

export function useChangeAccountEmail(
  options: Omit<
    UseMutationOptions<PatchAccountEmailResponse, BccApiError | Error, PatchAccountEmailBody>,
    "mutationFn"
  > = {},
) {
  return useMutation<PatchAccountEmailResponse, BccApiError | Error, PatchAccountEmailBody>({
    mutationFn: (body) => patchAccountEmail(body),
    ...options,
  });
}

export function useChangeAccountPassword(
  options: Omit<
    UseMutationOptions<PatchAccountPasswordResponse, BccApiError | Error, PatchAccountPasswordBody>,
    "mutationFn"
  > = {},
) {
  return useMutation<PatchAccountPasswordResponse, BccApiError | Error, PatchAccountPasswordBody>({
    mutationFn: (body) => patchAccountPassword(body),
    ...options,
  });
}

export function useDeleteAccount(
  options: Omit<
    UseMutationOptions<DeleteAccountResponse, BccApiError | Error, DeleteAccountBody>,
    "mutationFn"
  > = {},
) {
  return useMutation<DeleteAccountResponse, BccApiError | Error, DeleteAccountBody>({
    mutationFn: (body) => deleteAccount(body),
    ...options,
  });
}
