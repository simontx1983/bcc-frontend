"use client";

/**
 * useConversation — paginated read of a single thread (§4.19).
 *
 * Server marks every unread message in the conversation as viewed
 * as a side-effect of this read, so opening the thread also clears
 * the unread badge automatically. We refetch on focus + every 5s
 * while the tab is visible so peer messages surface live.
 */

import { useQuery } from "@tanstack/react-query";

import { getConversation } from "@/lib/api/messages-endpoints";
import type { BccApiError, ConversationThreadResponse } from "@/lib/api/types";

const DEFAULT_PER_PAGE = 30;
const POLL_VISIBLE_MS = 5_000;

export const CONVERSATION_QUERY_KEY_ROOT = ["conversation"] as const;

export interface UseConversationOptions {
  page?: number;
  perPage?: number;
  enabled?: boolean;
}

export function useConversation(
  id: number | null,
  options: UseConversationOptions = {},
) {
  const page = options.page ?? 1;
  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const callerEnabled = options.enabled ?? true;
  const enabled = callerEnabled && id !== null && id > 0;

  return useQuery<ConversationThreadResponse, BccApiError>({
    queryKey: [...CONVERSATION_QUERY_KEY_ROOT, id ?? 0, page, perPage],
    queryFn: ({ signal }) => {
      // `enabled` guards id !== null; React Query won't fire otherwise.
      return getConversation(id as number, { page, perPage }, signal);
    },
    enabled,
    staleTime: 2_000,
    refetchInterval: enabled ? POLL_VISIBLE_MS : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
}
