"use client";

/**
 * React Query hooks for the collection-stance panel (§4.31, v1.32).
 *
 * Mutations invalidate the panel query so counts + the viewer's stance
 * re-render immediately, and the holder-groups query so a join made
 * from the panel keeps /settings communities in sync.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  clearCollectionStance,
  getCollectionStancePanel,
  setCollectionStance,
} from "@/lib/api/collection-stances-endpoints";
import type {
  BccApiError,
  CollectionStancePanelResponse,
  CollectionStanceResponse,
  SetCollectionStanceRequest,
} from "@/lib/api/types";

export const COLLECTION_STANCE_PANEL_QUERY_KEY = ["collection-stances", "panel"] as const;

export function useCollectionStancePanel(enabled = true) {
  return useQuery<CollectionStancePanelResponse, BccApiError>({
    queryKey: COLLECTION_STANCE_PANEL_QUERY_KEY,
    queryFn: ({ signal }) => getCollectionStancePanel(signal),
    enabled,
    staleTime: 60_000,
  });
}

export function useSetCollectionStance(
  options: Omit<
    UseMutationOptions<CollectionStanceResponse, BccApiError, SetCollectionStanceRequest>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: CollectionStanceResponse, request: SetCollectionStanceRequest) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<CollectionStanceResponse, BccApiError, SetCollectionStanceRequest>({
    mutationFn: (request) => setCollectionStance(request),
    onSuccess: (data, request) => {
      void queryClient.invalidateQueries({ queryKey: COLLECTION_STANCE_PANEL_QUERY_KEY });
      callerOnSuccess?.(data, request);
    },
    ...rest,
  });
}

export function useClearCollectionStance(
  options: Omit<
    UseMutationOptions<
      CollectionStanceResponse,
      BccApiError,
      Pick<SetCollectionStanceRequest, "chain_id" | "contract_address">
    >,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (data: CollectionStanceResponse) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<
    CollectionStanceResponse,
    BccApiError,
    Pick<SetCollectionStanceRequest, "chain_id" | "contract_address">
  >({
    mutationFn: (identity) => clearCollectionStance(identity),
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: COLLECTION_STANCE_PANEL_QUERY_KEY });
      callerOnSuccess?.(data);
    },
    ...rest,
  });
}
