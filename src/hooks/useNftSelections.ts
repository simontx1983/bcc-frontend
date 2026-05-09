"use client";

/**
 * useNftSelections — React Query hooks for the NFT showcase.
 *
 * Two reads, two mutations:
 *
 *   READ
 *     - useNftPicker(force?)         → live holdings + selection state
 *     - useNftSelectionsList()       → currently saved selections
 *
 *   WRITE
 *     - useSaveNftSelection()        → POST /nft-selections
 *     - useDeleteNftSelection()      → DELETE /nft-selections
 *
 * Invalidation is left to callers (matches the project's standard
 * pattern; see useDisputes / useReportContent). The query-key roots
 * are exported so a single onSuccess handler can refresh both reads
 * in one go.
 */

import {
  useMutation,
  useQuery,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  deleteNftSelection,
  getNftPicker,
  listNftSelections,
  saveNftSelection,
} from "@/lib/api/nft-selections-endpoints";
import type {
  BccApiError,
  NftDeleteSelectionResponse,
  NftPickerResponse,
  NftSaveSelectionResponse,
  NftSelectionIdentity,
  NftSelectionsListResponse,
} from "@/lib/api/types";

export const NFT_PICKER_QUERY_KEY_ROOT = ["onchain", "nft-picker"] as const;
export const NFT_SELECTIONS_QUERY_KEY_ROOT = ["onchain", "nft-selections"] as const;

/**
 * GET /nft-selections/picker — live holdings annotated with which are
 * already selected. Pass `force=true` for the "refresh chain" flow
 * (wired in a future pass; the v1 picker reads cached data only).
 *
 * 60s staleTime — chain data doesn't move that fast and the modal is a
 * short-lived surface. Re-opening the modal within a minute won't hit
 * the indexer again.
 */
export function useNftPicker(
  options: { force?: boolean; enabled?: boolean } = {},
) {
  const force = options.force ?? false;
  return useQuery<NftPickerResponse, BccApiError>({
    queryKey: [...NFT_PICKER_QUERY_KEY_ROOT, force ? "force" : "cached"],
    queryFn: ({ signal }) => {
      const init: { force?: boolean; signal?: AbortSignal } = { signal };
      if (force) init.force = true;
      return getNftPicker(init);
    },
    enabled: options.enabled ?? true,
    staleTime: 60_000,
  });
}

/**
 * GET /nft-selections — the user's saved showcase. Same data the
 * profile selections strip would render.
 *
 * 30s staleTime — selections change in response to user actions on
 * THIS surface, and the mutations invalidate the cache directly, so
 * the staleTime is conservative bookkeeping.
 */
export function useNftSelectionsList() {
  return useQuery<NftSelectionsListResponse, BccApiError>({
    queryKey: [...NFT_SELECTIONS_QUERY_KEY_ROOT],
    queryFn: ({ signal }) => listNftSelections(signal),
    staleTime: 30_000,
  });
}

/**
 * POST /nft-selections — add an NFT to the showcase. Caller drives
 * invalidation: invalidate both NFT_PICKER_QUERY_KEY_ROOT (so the
 * modal flips the checkmark) and NFT_SELECTIONS_QUERY_KEY_ROOT
 * (so the strip on the profile updates).
 */
export function useSaveNftSelection(
  options: Omit<
    UseMutationOptions<NftSaveSelectionResponse, BccApiError, NftSelectionIdentity>,
    "mutationFn"
  > = {},
) {
  return useMutation<NftSaveSelectionResponse, BccApiError, NftSelectionIdentity>({
    mutationFn: (identity) => saveNftSelection(identity),
    ...options,
  });
}

/**
 * DELETE /nft-selections — remove an NFT from the showcase. Same
 * invalidation pattern as save.
 */
export function useDeleteNftSelection(
  options: Omit<
    UseMutationOptions<NftDeleteSelectionResponse, BccApiError, NftSelectionIdentity>,
    "mutationFn"
  > = {},
) {
  return useMutation<NftDeleteSelectionResponse, BccApiError, NftSelectionIdentity>({
    mutationFn: (identity) => deleteNftSelection(identity),
    ...options,
  });
}
