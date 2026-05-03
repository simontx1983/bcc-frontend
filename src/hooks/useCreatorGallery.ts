"use client";

/**
 * useCreatorGallery — paginated NFT gallery query for §H1.
 *
 * Built on `useInfiniteQuery` so a "Load more" button is a single
 * `fetchNextPage()`. The server caches the underlying read at 5 min
 * so re-renders are cheap; the frontend stale time is shorter so a
 * stale-hint refresh on focus picks up server-side refetches.
 *
 * Anon-OK at the API layer — no session gating in the hook.
 */

import {
  useInfiniteQuery,
  type InfiniteData,
  type QueryKey,
} from "@tanstack/react-query";

import { getCreatorGallery } from "@/lib/api/creator-gallery-endpoints";
import type {
  BccApiError,
  CreatorGalleryResponse,
  CreatorGallerySort,
} from "@/lib/api/types";

const PAGE_SIZE = 12;

interface UseCreatorGalleryOptions {
  slug: string;
  sort?: CreatorGallerySort;
}

export function useCreatorGallery({ slug, sort }: UseCreatorGalleryOptions) {
  return useInfiniteQuery<
    CreatorGalleryResponse,
    BccApiError,
    InfiniteData<CreatorGalleryResponse>,
    QueryKey,
    number
  >({
    queryKey: ["creator-gallery", slug, sort ?? "total_volume"],
    initialPageParam: 1,
    queryFn: ({ pageParam, signal }) =>
      getCreatorGallery(
        {
          slug,
          page: pageParam,
          per_page: PAGE_SIZE,
          ...(sort !== undefined ? { sort } : {}),
        },
        signal
      ),
    getNextPageParam: (lastPage) =>
      lastPage.pagination.has_more ? lastPage.pagination.page + 1 : undefined,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });
}
