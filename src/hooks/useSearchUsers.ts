"use client";

/**
 * useSearchUsers — users vertical of /search.
 *
 * Mirrors [useGlobalSearch](./useGlobalSearch.ts): 200ms debounce,
 * 2-char min, 15s stale, keepPreviousData. Hits bcc-search's
 * `/bcc/v1/search/users` directly (raw response, no §L5 envelope).
 */

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { getSearchUsers } from "@/lib/api/cards-search-endpoints";
import type { UserSearchResponse } from "@/lib/api/types";

const DEBOUNCE_MS = 200;
const MIN_LENGTH = 2;

export function useSearchUsers(rawQuery: string) {
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

  return useQuery<UserSearchResponse>({
    queryKey: ["search", "users", debounced],
    queryFn: ({ signal }) => getSearchUsers({ q: debounced }, signal),
    enabled: debounced.length >= MIN_LENGTH,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
  });
}
