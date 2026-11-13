"use client";

/**
 * §V2 Phase 2.5 — React Query mutations for /me/account.
 *
 *   - useChangeAccountEmail        — stages a change; sends a code
 *   - useVerifyAccountEmailChange  — applies it; swaps the bearer
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
  PENDING_NOTICE_TTL_MS,
  setPendingAuthNotice,
} from "@/lib/auth/session-boundary";
import { updateSessionBearer } from "@/lib/auth/session-update";
import { reRegisterCurrentPushSubscription } from "@/lib/push/re-register";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { MY_WALLETS_QUERY_KEY } from "@/hooks/useWallets";
import {
  deleteAccount,
  getMyAccountActivity,
  logoutEverywhere,
  patchAccountEmail,
  patchAccountPassword,
  verifyAccountEmailChange,
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
  VerifyAccountEmailChangeResponse,
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
    // `variables` carry the plaintext current_password; see the same
    // setting on useChangeAccountPassword. The card also resets the
    // mutation once it settles.
    gcTime: 0,
    ...options,
  });
}

/**
 * Outcome of confirming an email change. Same two-fact split as
 * {@link ChangePasswordOutcome}: once the verify call resolves the address
 * HAS changed and every earlier bearer is revoked; `sessionRestored` says
 * only whether the replacement bearer landed in the NextAuth session.
 */
export interface ChangeEmailOutcome {
  emailChanged: true;
  /** The newly applied address, as the server reported it. */
  email: string;
  sessionRestored: boolean;
}

/**
 * Invalidated after a confirmed email change — the same pair the
 * recovery-email verify refreshes (useRecoveryEmail), because a change
 * away from a wallet-only placeholder flips `recovery.has_recovery_email`
 * on the wallets read, and the user view-models carry email-derived
 * badges. The address shown in the change form itself comes from the
 * server session, not a query; the card tracks the confirmed value.
 */
// ["user"] is the per-handle profile read (useUser); ["users"] alone missed it.
const EMAIL_CHANGE_INVALIDATES = [MY_WALLETS_QUERY_KEY, ["users"], ["user"]] as const;

export function useVerifyAccountEmailChange(
  options: Omit<
    UseMutationOptions<ChangeEmailOutcome, BccApiError | Error, string>,
    "mutationFn"
  > = {},
) {
  const queryClient = useQueryClient();
  return useMutation<ChangeEmailOutcome, BccApiError | Error, string>({
    mutationFn: async (code) => {
      const res: VerifyAccountEmailChangeResponse = await verifyAccountEmailChange({ code });

      // Past this line the email HAS changed and the held bearer is dead.
      // The replacement goes through the same seam the password change
      // uses — never a second session writer.
      const sessionRestored = await updateSessionBearer({
        token: res.token,
        expiresIn: res.expires_in,
      });

      // AFTER the session write, so the refetches these trigger carry the
      // replacement bearer rather than the revoked one. Not awaited: a
      // slow refetch must not hold the confirmation open.
      for (const queryKey of EMAIL_CHANGE_INVALIDATES) {
        void queryClient.invalidateQueries({ queryKey });
      }

      return { emailChanged: true, email: res.email, sessionRestored };
    },
    gcTime: 0,
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
  const queryClient = useQueryClient();
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
      // Idempotent.
      //
      // Parked WITH A DEADLINE, which is what makes the withdrawal below
      // safe to narrow. The confirm cannot always tell whether its write
      // landed, so "restored" can be wrong — and withdrawing on a wrong
      // "restored" meant the teardown seconds later said "your session
      // ended", after which a viewer may try their OLD password and
      // conclude the change failed. The notice now outlives an ambiguous
      // outcome for `PENDING_NOTICE_TTL_MS`, long enough to label the
      // teardown a dead bearer causes (next authed read; badges poll
      // 30–60s while visible) and short enough that an unrelated sign-out
      // later is not blamed on the password change.
      setPendingAuthNotice("password-changed", PENDING_NOTICE_TTL_MS);

      const sessionRestored = await updateSessionBearer({
        token: res.token,
        expiresIn: res.expires_in,
      });

      // NOT withdrawn on success any more, and that is the fix.
      //
      // `sessionRestored === true` includes the case where a DIFFERENT
      // bearer was found and only the echo licensed accepting it — which
      // is precisely the outcome that can be wrong (session-update's
      // residual A). Withdrawing there threw away the explanation seconds
      // before the dead bearer tore the session down, leaving the viewer
      // with a generic "your session ended" after changing their password,
      // and no reason to believe the change had worked.
      //
      // The deadline above retires the notice instead. Nothing here has to
      // guess whether the write landed, and the accepted cost is narrow: a
      // deliberate sign-out within PENDING_NOTICE_TTL_MS of a password
      // change carries "use your new password", which is true and
      // actionable even though a plain sign-out notice would have done.
      // A more specific reason — a suspension, say — still wins outright;
      // `landingUrl` lets a parked slug outrank only the generic slug.

      // The server deleted every push subscription with the password
      // change, this device's included. Put this device's back, but only
      // when the new bearer reached the session (otherwise the request
      // would carry a revoked token). Best-effort and not awaited: it
      // never prompts, never throws, and cannot change this outcome.
      if (sessionRestored) {
        void reRegisterCurrentPushSubscription();
        // F-253: a wallet-only member who just set a FIRST password now has
        // `recovery.has_password: true`. Refresh it, or the email / delete
        // forms keep offering the wallet path and the server refuses it.
        void queryClient.invalidateQueries({ queryKey: MY_WALLETS_QUERY_KEY });
      }

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
