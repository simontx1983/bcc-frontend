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
  endSession,
  setPendingAuthNotice,
} from "@/lib/auth/session-boundary";
import { updateSessionBearer } from "@/lib/auth/session-update";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  type UseMutationOptions,
} from "@tanstack/react-query";

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

/**
 * Outcome of a password change. TWO independent facts, deliberately not
 * collapsed into one:
 *
 *   passwordChanged  — the server accepted it. Once true it is permanent;
 *                      the old password no longer works, whatever else
 *                      happens afterwards.
 *   sessionRestored  — the replacement bearer landed in the NextAuth
 *                      session, so the viewer stays signed in.
 *
 * Reporting the second as if it implied the first (or vice versa) is the
 * defect being fixed: the UI used to say "Saved" and then start 401-ing.
 */
export interface ChangePasswordOutcome {
  passwordChanged: true;
  sessionRestored: boolean;
}

export function useChangeAccountPassword(
  options: Omit<
    UseMutationOptions<ChangePasswordOutcome, BccApiError | Error, PatchAccountPasswordBody>,
    "mutationFn"
  > = {},
) {
  return useMutation<ChangePasswordOutcome, BccApiError | Error, PatchAccountPasswordBody>({
    mutationFn: async (body) => {
      const res: PatchAccountPasswordResponse = await patchAccountPassword(body);

      // Past this line the password HAS changed. A failure from here on
      // must never be surfaced as "the change failed", because retrying
      // with the old current_password would now be rejected and the
      // viewer would conclude something worse had gone wrong.

      // Park the explanation HERE, on the fact, not in onSuccess after the
      // session write. Every outstanding bearer is revoked as of the line
      // above, so from this instant any authed request carries a dead
      // token — and the badges query polls on a timer and refetches on
      // window focus. Its 401 refreshes a revoked token, gets "rejected",
      // and ends the session with the GENERIC slug. Parking after the
      // three session-write round trips left that whole window able to
      // announce a definitely-changed password as "your session ended".
      // Idempotent, and AccountSection clears it if the session turns out
      // to have been restored.
      setPendingAuthNotice("password-changed");

      const sessionRestored = await updateSessionBearer({
        token: res.token,
        expiresIn: res.expires_in,
      });

      return { passwordChanged: true, sessionRestored };
    },
    // `mutate()` stores its `variables` on the Mutation in the
    // MutationCache, so BOTH plaintext passwords stay reachable from
    // `queryClient.getMutationCache()` for as long as an observer is
    // subscribed — on the success path, the whole time the settings page
    // is mounted. gcTime 0 lets them go as soon as nothing is observing.
    gcTime: 0,
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
 * session and hard-redirect to `/` (matches the avatar-menu /
 * MobileMenuSheet logout idiom). The signOut() also navigates, so
 * any caller-side "you signed out" toast must be transient or
 * preserved via the redirect query string.
 */
export function useLogoutEverywhere() {
  return useMutation<LogoutEverywhereResponse, BccApiError | Error, void>({
    mutationFn: () => logoutEverywhere(),
    onSuccess: () => {
      // Through the boundary: "sign out everywhere" is exactly the case
      // where leaving this device's cached private data behind would be
      // worst, and the bearer is already dead server-side.
      void endSession("user");
    },
  });
}
