"use client";

/**
 * §V1.5 — React Query hooks for linked-wallet management.
 *
 * `useMyWallets` is session-scoped + refetched on focus so a user who
 * links a wallet via the §N8 claim flow (or another tab) sees it
 * immediately when they return to /settings/identity.
 *
 * `useUnlinkWallet` invalidates on success — also bumps the user
 * view-model query so any wallet badge on the profile header refreshes.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { linkWallet } from "@/lib/api/auth-endpoints";
import { getMyWallets, unlinkWallet } from "@/lib/api/wallets-endpoints";
import type {
  BccApiError,
  LinkWalletResponse,
  MyWalletsResponse,
  UnlinkWalletResponse,
} from "@/lib/api/types";
import type { WalletChainType } from "@/lib/wallet/chain-catalog";
import { runLinkFlow } from "@/lib/wallet/linkFlow";

export const MY_WALLETS_QUERY_KEY = ["me", "wallets"] as const;

/** Args for {@link useLinkWalletMutation} — the chain to connect + link. */
export interface LinkWalletVars {
  chainSlug: string;
  chainType: WalletChainType;
}

export function useMyWallets(enabled: boolean = true) {
  return useQuery<MyWalletsResponse, BccApiError>({
    queryKey: MY_WALLETS_QUERY_KEY,
    queryFn: ({ signal }) => getMyWallets(signal),
    staleTime: 30_000,
    enabled,
  });
}

/**
 * Connect → sign → link a wallet, all in one mutation. Wraps the shared
 * {@link runLinkFlow} (wallet popup + signature) followed by the
 * `POST /auth/wallet-link` call, then invalidates the linked-wallets query
 * and the user view-model (profile wallet badges) — mirroring what
 * WalletsSection does on a successful link. Errors (provider/user-cancel OR
 * server BccApiError) propagate raw; callers humanize via `humanizeLinkError`.
 */
export function useLinkWalletMutation(
  options: Omit<
    UseMutationOptions<LinkWalletResponse, Error, LinkWalletVars>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: LinkWalletResponse, vars: LinkWalletVars) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<LinkWalletResponse, Error, LinkWalletVars>({
    mutationFn: async ({ chainSlug, chainType }) => {
      const linked = await runLinkFlow(chainSlug, chainType);
      return linkWallet({
        wallet_address: linked.address,
        signature:      linked.signature,
        wallet_type:    linked.walletType,
        extra:          linked.extra,
      });
    },
    onSuccess: (data, vars) => {
      void queryClient.invalidateQueries({ queryKey: MY_WALLETS_QUERY_KEY });
      // The user view-model holds wallet badges; refresh them too.
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      callerOnSuccess?.(data, vars);
    },
    ...rest,
  });
}

export function useUnlinkWallet(
  options: Omit<
    UseMutationOptions<UnlinkWalletResponse, BccApiError, number>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: UnlinkWalletResponse, walletId: number) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<UnlinkWalletResponse, BccApiError, number>({
    mutationFn: (walletId) => unlinkWallet(walletId),
    onSuccess: (data, walletId) => {
      void queryClient.invalidateQueries({ queryKey: MY_WALLETS_QUERY_KEY });
      // Also invalidate the user view-model — wallet count + verified
      // badges live there too.
      void queryClient.invalidateQueries({ queryKey: ["users"] });
      callerOnSuccess?.(data, walletId);
    },
    ...rest,
  });
}
