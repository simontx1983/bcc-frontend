"use client";

/**
 * useNftSelections — React Query hooks for the NFT showcase.
 *
 * Two reads, three mutations:
 *
 *   READ
 *     - useNftPicker(force?)         → live holdings + selection state
 *     - useNftSelectionsList()       → currently saved selections
 *
 *   WRITE
 *     - useSaveNftSelection()        → POST /nft-selections
 *     - useDeleteNftSelection()      → DELETE /nft-selections
 *     - useReorderNftSelections()    → POST /nft-selections/reorder
 *                                       (optimistic; rolls back on error)
 *
 * Invalidation is left to callers for save/delete (matches the
 * project's standard pattern; see useDisputes / useReportContent).
 * Reorder is self-managing because the optimistic-update pattern owns
 * cache mutation directly — callers don't need invalidate handlers.
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  deleteNftSelection,
  getNftPicker,
  listNftSelections,
  reorderNftSelections,
  saveNftSelection,
} from "@/lib/api/nft-selections-endpoints";
import type {
  BccApiError,
  NftDeleteSelectionResponse,
  NftPickerResponse,
  NftReorderResponse,
  NftSaveSelectionResponse,
  NftSelectionIdentity,
  NftSelectionRow,
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

interface ReorderMutationContext {
  /** Snapshot of the selections list before the optimistic patch. */
  previous: NftSelectionsListResponse | undefined;
}

/**
 * POST /nft-selections/reorder — set new display order for the
 * viewer's selections.
 *
 * Optimistic-mutation idiom (see `useReactions.ts` and `useMyPrivacy.ts`
 * for sibling implementations):
 *
 *   1. onMutate    → cancel in-flight refetches, snapshot the current
 *                    list, patch the cache to the new order so the UI
 *                    re-renders instantly.
 *   2. onError     → restore the snapshot.
 *   3. onSettled   → invalidate both the selections list AND the
 *                    picker (the picker's `is_selected` order isn't
 *                    visible, but downstream consumers may key off the
 *                    list order, so we keep them in sync).
 */
export function useReorderNftSelections() {
  const queryClient = useQueryClient();

  return useMutation<NftReorderResponse, BccApiError, number[], ReorderMutationContext>({
    mutationFn: (orderedIds) => reorderNftSelections(orderedIds),

    onMutate: async (orderedIds) => {
      await queryClient.cancelQueries({ queryKey: NFT_SELECTIONS_QUERY_KEY_ROOT });

      const previous = queryClient.getQueryData<NftSelectionsListResponse>(
        [...NFT_SELECTIONS_QUERY_KEY_ROOT],
      );

      if (previous !== undefined) {
        const byId = new Map<number, NftSelectionRow>();
        for (const row of previous.items) {
          byId.set(Number(row.id), row);
        }
        const reordered: NftSelectionRow[] = [];
        orderedIds.forEach((id, idx) => {
          const row = byId.get(id);
          if (row !== undefined) {
            reordered.push({ ...row, display_order: idx });
          }
        });
        queryClient.setQueryData<NftSelectionsListResponse>(
          [...NFT_SELECTIONS_QUERY_KEY_ROOT],
          { items: reordered },
        );
      }

      return { previous };
    },

    onError: (_err, _orderedIds, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(
          [...NFT_SELECTIONS_QUERY_KEY_ROOT],
          context.previous,
        );
      }
    },

    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: NFT_SELECTIONS_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: NFT_PICKER_QUERY_KEY_ROOT });
    },
  });
}
