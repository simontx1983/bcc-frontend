"use client";

/**
 * useMentionSearch — debounced @-mention autocomplete query.
 *
 * Backed by GET /users/mention-search (api-contract-v1.md §3.3.12 +
 * §4.4). Server-side privacy filters (PeepSoUserSearch) are inherited
 * for free; the hook just owns the keystroke debounce + React Query
 * cache.
 *
 * V1d posture (per §3.3.12 deferred):
 *   - Empty/whitespace query → no fetch, empty result list. The picker
 *     does not surface "recent contacts" candidates pre-typing.
 *   - 300ms debounce window — same shape as `useGiphySearch`. Tight
 *     enough to feel responsive, loose enough that a 4-char prefix
 *     burst hits the server once at the end.
 *   - 8-row hard cap mirrors the server (`MENTION_SEARCH_MAX_LIMIT`).
 *
 * Returns the standard React Query shape `{data, isLoading, error}`.
 * Consumers (MentionPopover) render inline loading/error states.
 */

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { searchMentions } from "@/lib/api/mentions-endpoints";
import type { MentionSearchCandidate } from "@/lib/api/types";

const SEARCH_DEBOUNCE_MS = 300;
const RESULT_LIMIT       = 8;

interface UseMentionSearchOptions {
  query: string;
  /** When false the hook idles. Used to defer fetching until the picker is open. */
  enabled: boolean;
}

export function useMentionSearch({ query, enabled }: UseMentionSearchOptions) {
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [query]);

  const trimmed = debouncedQuery.trim();
  const isReady = enabled && trimmed !== "";

  return useQuery<MentionSearchCandidate[], Error>({
    queryKey: ["mentions", "search", trimmed],
    enabled: isReady,
    queryFn: async () => {
      const response = await searchMentions(trimmed, RESULT_LIMIT);
      return response.items;
    },
    staleTime: 10_000,
    retry: 1,
  });
}
