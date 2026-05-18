"use client";

/**
 * useConversation — paginated read of a single thread (§4.19).
 *
 * Server marks every unread message in the conversation as viewed
 * as a side-effect of this read, so opening the thread also clears
 * the unread badge automatically.
 *
 * Live-update mechanism (post polling-coalesce):
 *   The hook no longer polls every 5s. Instead it registers the
 *   conversation id with `useOpenThreadHint`, which folds a
 *   per-thread `latest_message_id` hint into the shared /me/badges
 *   payload. When that id advances the hint hook invalidates this
 *   query and React Query refetches — same UX, ~13× fewer requests.
 *   `refetchOnWindowFocus: true` is the safety net for the rare case
 *   where a tab woke up before the next /me/badges tick.
 *
 *   To preserve this property: do NOT add a `refetchInterval` here.
 *   If you need faster-than-8s latency, lower the badges poll cadence
 *   in useBadges.tsx instead — that change moves every consumer at
 *   once.
 */

import { useQuery } from "@tanstack/react-query";

import { useOpenThreadHint } from "@/hooks/useBadges";
import { getConversation } from "@/lib/api/messages-endpoints";
import type { BccApiError, ConversationThreadResponse } from "@/lib/api/types";

const DEFAULT_PER_PAGE = 30;

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

  // Register the thread with the shared badges poll so the server
  // returns a latest_message_id hint. The hook handles invalidation
  // of this query when the hint advances — no need to wire anything
  // additional here.
  useOpenThreadHint(enabled ? id : null);

  return useQuery<ConversationThreadResponse, BccApiError>({
    queryKey: [...CONVERSATION_QUERY_KEY_ROOT, id ?? 0, page, perPage],
    queryFn: ({ signal }) => {
      // `enabled` guards id !== null; React Query won't fire otherwise.
      return getConversation(id as number, { page, perPage }, signal);
    },
    enabled,
    staleTime: 2_000,
    refetchOnWindowFocus: true,
  });
}
