"use client";

/**
 * useSearchProjects — projects vertical of /search.
 *
 * Mirrors [useGlobalSearch](./useGlobalSearch.ts) (the shared
 * [useSearchTerm](./useSearchTerm.ts) debounce and 2-char floor, 15s
 * stale, keepPreviousData) but hits bcc-search's raw
 * `/bcc/v1/search?q=&type=` instead of the §A2 cards/search wrapper.
 *
 * Why direct instead of through /cards/search:
 *   The results page renders the FULL project view-model (tier badge,
 *   verified, endorsements, category) — fields the §A2 wrapper drops
 *   in favour of the trimmed SearchSuggestion shape. The dropdown still
 *   uses /cards/search; this hook is the page-level escape hatch.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { useSearchTerm } from "@/hooks/useSearchTerm";
import { getSearchProjects } from "@/lib/api/cards-search-endpoints";
import type { ProjectSearchResponse } from "@/lib/api/types";

interface UseSearchProjectsOptions {
  /** Filter by reputation category slug (validator/builder/creator). */
  type?: string;
}

export function useSearchProjects(
  rawQuery: string,
  options: UseSearchProjectsOptions = {}
) {
  const term = useSearchTerm(rawQuery);

  return useQuery<ProjectSearchResponse>({
    queryKey: ["search", "projects", term, options.type ?? ""],
    queryFn: ({ signal }) =>
      getSearchProjects(
        {
          q: term,
          ...(options.type !== undefined ? { type: options.type } : {}),
        },
        signal
      ),
    enabled: term !== "",
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}
