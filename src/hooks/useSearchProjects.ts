"use client";

/**
 * useSearchProjects — projects vertical of /search.
 *
 * Mirrors [useGlobalSearch](./useGlobalSearch.ts) (debounced, 2-char min,
 * 15s stale, keepPreviousData) but hits bcc-search's raw
 * `/bcc/v1/search?q=&type=` instead of the §A2 cards/search wrapper.
 *
 * Why direct instead of through /cards/search:
 *   The results page renders the FULL project view-model (tier badge,
 *   verified, endorsements, category) — fields the §A2 wrapper drops
 *   in favour of the trimmed SearchSuggestion shape. The dropdown still
 *   uses /cards/search; this hook is the page-level escape hatch.
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getSearchProjects } from "@/lib/api/cards-search-endpoints";
import type { ProjectSearchResponse } from "@/lib/api/types";

const DEBOUNCE_MS = 200;
const MIN_LENGTH = 2;

interface UseSearchProjectsOptions {
  /** Filter by reputation category slug (validator/builder/creator). */
  type?: string;
}

export function useSearchProjects(
  rawQuery: string,
  options: UseSearchProjectsOptions = {}
) {
  const [debounced, setDebounced] = useState<string>("");

  useEffect(() => {
    const trimmed = rawQuery.trim();
    if (trimmed.length < MIN_LENGTH) {
      setDebounced("");
      return;
    }
    const t = window.setTimeout(() => setDebounced(trimmed), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [rawQuery]);

  return useQuery<ProjectSearchResponse>({
    queryKey: ["search", "projects", debounced, options.type ?? ""],
    queryFn: ({ signal }) =>
      getSearchProjects(
        {
          q: debounced,
          ...(options.type !== undefined ? { type: options.type } : {}),
        },
        signal
      ),
    enabled: debounced.length >= MIN_LENGTH,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}
