"use client";

/**
 * §V2 Phase 2.5 — React Query mutations for /me/account.
 *
 *   - useChangeAccountEmail
 *   - useChangeAccountPassword
 *   - useDeleteAccount
 *
 * Tier D additions (§4.23):
 *   - useAccountActivity   — paginated audit timeline read
 *   - useLogoutEverywhere  — destructive token-version bump + signOut
 *
 * No cached resource here for the mutations — each is a one-shot,
 * side-effecting call. After deleteAccount() succeeds, the auth
 * cookie is gone, so the caller should redirect to logout_url.
 */

import {
  keepPreviousData,
  useMutation,
  useQuery,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { signOut } from "next-auth/react";

import {
  deleteAccount,
  getMyAccountActivity,
  logoutEverywhere,
  patchAccountEmail,
  patchAccountPassword,
  type DeleteAccountBody,
  type DeleteAccountResponse,
  type PatchAccountEmailBody,
  type PatchAccountEmailResponse,
  type PatchAccountPasswordBody,
  type PatchAccountPasswordResponse,
} from "@/lib/api/account-endpoints";
import type {
  AccountActivityResponse,
  BccApiError,
  LogoutEverywhereResponse,
} from "@/lib/api/types";

export const ACCOUNT_ACTIVITY_QUERY_KEY_ROOT = ["me", "account-activity"] as const;

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

/**
 * GET /me/account-activity — paginated audit timeline.
 *
 * `staleTime: 0` because this surface is the user's safety net for
 * verifying email alerts against in-app state — they may refresh
 * specifically to check a just-arrived warning. `placeholderData`
 * (the v5 `keepPreviousData` shape) keeps the previous page visible
 * during the "OLDER →" transition so the timeline doesn't flicker.
 */
export function useAccountActivity(page: number = 1, perPage: number = 20) {
  return useQuery<AccountActivityResponse, BccApiError>({
    queryKey: [...ACCOUNT_ACTIVITY_QUERY_KEY_ROOT, page, perPage],
    queryFn: () => getMyAccountActivity(page, perPage),
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

/**
 * POST /auth/logout-everywhere — destructive credential mutation.
 *
 * The server-side handler audit-logs + emails + revokes BEFORE the
 * response is sent, so by the time we resolve here the bearer is
 * already dead. We force a NextAuth signOut to clear the local
 * session and hard-redirect to `/` (matches the ViewerMenu /
 * MobileMenuSheet logout idiom). The signOut() also navigates, so
 * any caller-side "you signed out" toast must be transient or
 * preserved via the redirect query string.
 */
export function useLogoutEverywhere() {
  return useMutation<LogoutEverywhereResponse, BccApiError | Error, void>({
    mutationFn: () => logoutEverywhere(),
    onSuccess: () => {
      void signOut({ callbackUrl: "/" });
    },
  });
}
