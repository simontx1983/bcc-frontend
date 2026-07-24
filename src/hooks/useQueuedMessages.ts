"use client";

/**
 * useQueuedMessages — paginated read of /me/queued-messages (§4.19).
 *
 * The viewer's own pending pre-claim validator messages (the "Queued"
 * tab of /messages). Same offset-pagination + staleTime shape as
 * useConversations; no polling (the list only changes when the viewer
 * queues a new message or a validator gets claimed, both rare).
 */

import { useQuery } from "@tanstack/react-query";

import { listQueuedMessages } from "@/lib/api/messages-endpoints";
import type { BccApiError, QueuedMessagesResponse } from "@/lib/api/types";

const DEFAULT_PER_PAGE = 20;

export const QUEUED_MESSAGES_QUERY_KEY_ROOT = ["queued-messages"] as const;

export interface UseQueuedMessagesOptions {
  page?: number;
  perPage?: number;
  enabled?: boolean;
}

export function useQueuedMessages(options: UseQueuedMessagesOptions = {}) {
  const page = options.page ?? 1;
  const perPage = options.perPage ?? DEFAULT_PER_PAGE;
  const enabled = options.enabled ?? true;

  return useQuery<QueuedMessagesResponse, BccApiError>({
    queryKey: [...QUEUED_MESSAGES_QUERY_KEY_ROOT, page, perPage],
    queryFn: ({ signal }) => listQueuedMessages({ page, perPage }, signal),
    enabled,
    staleTime: 10_000,
  });
}
