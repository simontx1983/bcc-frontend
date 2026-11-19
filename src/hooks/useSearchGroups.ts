"use client";

/**
 * useSearchGroups — groups vertical of /search.
 *
 * Mirrors [useGlobalSearch](./useGlobalSearch.ts): the shared
 * [useSearchTerm](./useSearchTerm.ts) debounce and 2-char floor, 15s
 * stale, keepPreviousData. Hits bcc-search's
 * `/bcc/v1/search/groups` directly (raw response, no §L5 envelope).
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useSearchTerm } from "@/hooks/useSearchTerm";
import { getSearchGroups } from "@/lib/api/cards-search-endpoints";
import type { GroupSearchResponse } from "@/lib/api/types";

export function useSearchGroups(rawQuery: string) {
  const term = useSearchTerm(rawQuery);

  return useQuery<GroupSearchResponse>({
    queryKey: ["search", "groups", term],
    queryFn: ({ signal }) => getSearchGroups({ q: term }, signal),
    enabled: term !== "",
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}
