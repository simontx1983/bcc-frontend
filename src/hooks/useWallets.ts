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

import { getMyWallets, unlinkWallet } from "@/lib/api/wallets-endpoints";
import type {
  BccApiError,
  MyWalletsResponse,
  UnlinkWalletResponse,
} from "@/lib/api/types";

export const MY_WALLETS_QUERY_KEY = ["me", "wallets"] as const;

export function useMyWallets(enabled: boolean = true) {
  return useQuery<MyWalletsResponse, BccApiError>({
    queryKey: MY_WALLETS_QUERY_KEY,
    queryFn: ({ signal }) => getMyWallets(signal),
    staleTime: 30_000,
    enabled,
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
