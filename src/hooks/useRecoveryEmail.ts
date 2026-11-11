"use client";

/**
 * §V2 — React Query hooks for the recovery-email flow (wallet-only
 * accounts attaching a real, deliverable email).
 *
 * Two-step, mirroring the wallet-link mutation shape in useWallets.ts:
 *
 *   useRequestRecoveryEmail — runs the shared {@link runLinkFlow} (wallet
 *     popup → authed nonce → signature) for a wallet the user has already
 *     linked + verified, then POSTs the signed proof + email. On success
 *     the server has emailed a 6-digit OTP; the UI advances to step 2.
 *
 *   useVerifyRecoveryEmail — confirms the OTP. On success it invalidates
 *     the linked-wallets query (so the recovery banner clears) and the
 *     user view-model (so any profile recovery/verified badge refreshes).
 *
 * Errors propagate raw (provider/user-cancel OR server BccApiError) so the
 * call site can humanize via `humanizeLinkError` + a recovery copy map.
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { MY_WALLETS_QUERY_KEY } from "@/hooks/useWallets";
import { updateSessionBearer } from "@/lib/auth/session-update";
import {
  requestRecoveryEmail,
  verifyRecoveryEmail,
} from "@/lib/api/account-endpoints";
import type {
  BccApiError,
  RecoveryEmailRequestResponse,
  VerifyRecoveryEmailResponse,
} from "@/lib/api/types";
import type { WalletChainType } from "@/lib/wallet/chain-catalog";
import { runLinkFlow } from "@/lib/wallet/linkFlow";

/** Args for {@link useRequestRecoveryEmail}. */
export interface RequestRecoveryEmailVars {
  /** Slug of a wallet the user has already linked + verified. */
  chainSlug: string;
  chainType: WalletChainType;
  /** The real recovery email to attach. */
  email: string;
}

/**
 * Connect → sign → submit the recovery email in one mutation. The wallet
 * proof is produced by the shared {@link runLinkFlow}; we do NOT write new
 * signing code (§11). Errors propagate raw.
 */
export function useRequestRecoveryEmail(
  options: Omit<
    UseMutationOptions<
      RecoveryEmailRequestResponse,
      Error,
      RequestRecoveryEmailVars
    >,
    "mutationFn"
  > = {},
) {
  return useMutation<
    RecoveryEmailRequestResponse,
    Error,
    RequestRecoveryEmailVars
  >({
    mutationFn: async ({ chainSlug, chainType, email }) => {
      const signed = await runLinkFlow(chainSlug, chainType);
      return requestRecoveryEmail({
        wallet_address: signed.address,
        chain_slug:     chainSlug,
        signature:      signed.signature,
        email,
        extra:          signed.extra,
      });
    },
    ...options,
  });
}

/**
 * Confirm the 6-digit OTP. On success invalidates the linked-wallets
 * query (clears the recovery banner) + the user view-model (profile
 * badges). Caller `onSuccess` still fires after the invalidations.
 */
/**
 * The confirm's result plus whether the replacement bearer reached the
 * session: true stored, false the write failed (the old bearer is
 * already revoked, so this device must sign in again), null when no
 * token came back (an older backend).
 */
export type VerifyRecoveryEmailOutcome = VerifyRecoveryEmailResponse & {
  sessionRestored: boolean | null;
};

export function useVerifyRecoveryEmail(
  options: Omit<
    UseMutationOptions<VerifyRecoveryEmailOutcome, BccApiError, string>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: VerifyRecoveryEmailOutcome, code: string) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<VerifyRecoveryEmailOutcome, BccApiError, string>({
    mutationFn: async (code) => {
      const data = await verifyRecoveryEmail({ code });
      // The confirm revokes the old bearer and returns a replacement.
      // Store it BEFORE anything refetches (same order as the email-change
      // confirm); the pending-bearer seam covers in-flight requests.
      if (typeof data.token === "string" && data.token !== "" && typeof data.expires_in === "number") {
        const sessionRestored = await updateSessionBearer({
          token: data.token,
          expiresIn: data.expires_in,
        });
        return { ...data, sessionRestored };
      }
      return { ...data, sessionRestored: null };
    },
    onSuccess: (data, code) => {
      void queryClient.invalidateQueries({ queryKey: MY_WALLETS_QUERY_KEY });
      // useUser keys on ["user", handle]; ["users", …] is the per-profile
      // panel namespace, kept so those refresh too.
      void queryClient.invalidateQueries({ queryKey: ["user"] });
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      callerOnSuccess?.(data, code);
    },
    ...rest,
  });
}
