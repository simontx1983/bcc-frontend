"use client";

/**
 * useConversations — paginated read of /me/conversations (§4.19).
 *
 * Fixed offset pagination matches the inbox UX (Prev/Next chips); not
 * an infinite list. `staleTime` keeps tab-switches snappy without
 * burning a refetch on every focus. Polling lives on
 * `useUnreadMessageCount`; the inbox itself only refetches on
 * mutation invalidation.
 */

import { useQuery } from "@tanstack/react-query";

import { listConversations } from "@/lib/api/messages-endpoints";
import type { BccApiError, ConversationListResponse } from "@/lib/api/types";

const DEFAULT_PER_PAGE = 20;

export const CONVERSATIONS_QUERY_KEY_ROOT = ["conversations"] as const;

export interface UseConversationsOptions {
  page?: number;
  perPage?: number;
  enabled?: boolean;
}

export function useConversations(options: UseConversationsOptions = {}) {
  const page = options.page ?? 1;
  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const enabled = options.enabled ?? true;

  return useQuery<ConversationListResponse, BccApiError>({
    queryKey: [...CONVERSATIONS_QUERY_KEY_ROOT, page, perPage],
    queryFn: ({ signal }) => listConversations({ page, perPage }, signal),
    enabled,
    staleTime: 10_000,
  });
}
