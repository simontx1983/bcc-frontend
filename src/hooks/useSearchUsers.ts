"use client";

/**
 * useSearchUsers — users vertical of /search.
 *
 * Mirrors [useGlobalSearch](./useGlobalSearch.ts): the shared
 * [useSearchTerm](./useSearchTerm.ts) debounce and 2-char floor, 15s
 * stale, keepPreviousData. Hits bcc-search's `/bcc/v1/search/users`
 * directly (raw response, no §L5 envelope).
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useSearchTerm } from "@/hooks/useSearchTerm";
import { getSearchUsers } from "@/lib/api/cards-search-endpoints";
import type { UserSearchResponse } from "@/lib/api/types";

export function useSearchUsers(rawQuery: string) {
  const term = useSearchTerm(rawQuery);

  return useQuery<UserSearchResponse>({
    queryKey: ["search", "users", term],
    queryFn: ({ signal }) => getSearchUsers({ q: term }, signal),
    enabled: term !== "",
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}
