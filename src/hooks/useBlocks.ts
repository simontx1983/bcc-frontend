"use client";

/**
 * useMyBlocks / useBlockUser / useUnblockUser — §K1 Phase A hooks.
 *
 * On success, both mutations refresh:
 *   1. The /me/blocks query (the settings list re-renders)
 *   2. The feed query roots (a fresh block should hide that author's
 *      posts on the next refetch)
 *   3. The suggested-members list (a block in either direction excludes
 *      the member from it)
 *
 * Audit M15 (F-261): after a block the person still showed as
 * "Watching". The server severs watches in BOTH directions on a new block
 * (F-29, contract v1.124), so a block also writes "not watching" into
 * every cached copy of that member (patchViewerWatchInCache) and re-reads
 * the watching list. The server-rendered profile (its Message pill comes
 * from the server's permissions) is refreshed by the caller on that page,
 * BlockToggle, with router.refresh(): a hook here stays router-free, since
 * the settings list uses it too.
 *
 * No optimistic state on the mutation itself — blocks are infrequent +
 * the round trip is fast. Optimistic UI on the profile button is the
 * caller's job (toggle local state + roll back on error).
 */

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import {
  blockUser,
  getMyBlocks,
  unblockUser,
} from "@/lib/api/blocks-endpoints";
import type {
  BccApiError,
  BlockUserResponse,
  MyBlocksResponse,
  UnblockUserResponse,
} from "@/lib/api/types";
import { FEED_QUERY_KEY_ROOT, HOT_FEED_QUERY_KEY } from "@/hooks/useFeed";
import { SUGGESTED_MEMBERS_QUERY_KEY } from "@/hooks/useSuggestedMembers";
import { patchViewerWatchInCache } from "@/hooks/useWatch";
import { WATCHING_QUERY_KEY_ROOT } from "@/hooks/useWatching";

const DEFAULT_PER_PAGE = 20;

export const MY_BLOCKS_QUERY_KEY_ROOT = ["me", "blocks"] as const;

export function useMyBlocks(page: number = 1) {
  return useQuery<MyBlocksResponse, BccApiError>({
    queryKey: [...MY_BLOCKS_QUERY_KEY_ROOT, page],
    queryFn: ({ signal }) =>
      getMyBlocks({ page, perPage: DEFAULT_PER_PAGE }, signal),
    staleTime: 30_000,
  });
}

export function useBlockUser(
  options: Omit<
    UseMutationOptions<BlockUserResponse, BccApiError, number>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (
      data: BlockUserResponse,
      userId: number,
    ) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<BlockUserResponse, BccApiError, number>({
    mutationFn: (userId) => blockUser(userId),
    onSuccess: (data, userId) => {
      // Invalidate all surfaces a fresh block affects:
      // - the blocks list (settings page)
      // - both feed roots (the blocked author's posts disappear)
      // - watching: the server severed it both ways (F-29), so every
      //   cached copy of this member stops reading "Watching" now, and
      //   the watching list and suggestions re-read
      void queryClient.invalidateQueries({ queryKey: MY_BLOCKS_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HOT_FEED_QUERY_KEY });
      patchViewerWatchInCache(queryClient, "member", userId, null);
      void queryClient.invalidateQueries({ queryKey: WATCHING_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: SUGGESTED_MEMBERS_QUERY_KEY });
      callerOnSuccess?.(data, userId);
    },
    ...rest,
  });
}

export function useUnblockUser(
  options: Omit<
    UseMutationOptions<UnblockUserResponse, BccApiError, number>,
    "mutationFn" | "onSuccess"
  > & {
    onSuccess?: (
      data: UnblockUserResponse,
      userId: number,
    ) => void;
  } = {},
) {
  const queryClient = useQueryClient();
  const { onSuccess: callerOnSuccess, ...rest } = options;

  return useMutation<UnblockUserResponse, BccApiError, number>({
    mutationFn: (userId) => unblockUser(userId),
    onSuccess: (data, userId) => {
      void queryClient.invalidateQueries({ queryKey: MY_BLOCKS_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: HOT_FEED_QUERY_KEY });
      // An unblock restores no watches; the member may be suggested again.
      void queryClient.invalidateQueries({ queryKey: SUGGESTED_MEMBERS_QUERY_KEY });
      callerOnSuccess?.(data, userId);
    },
    ...rest,
  });
}
