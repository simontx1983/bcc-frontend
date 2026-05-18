"use client";

/**
 * useReplyInConversation — POST /me/conversations/{id}/messages (§4.19).
 *
 * Composer's submit handler. On success: invalidate the conversation
 * thread (so the new message surfaces) + the inbox roots (so the row's
 * preview + last_activity update) + unread-count.
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { replyInConversation } from "@/lib/api/messages-endpoints";
import type { BccApiError, SendMessageResponse } from "@/lib/api/types";
import { BADGES_QUERY_KEY_ROOT } from "@/hooks/useBadges";
import { CONVERSATIONS_QUERY_KEY_ROOT } from "@/hooks/useConversations";
import { CONVERSATION_QUERY_KEY_ROOT } from "@/hooks/useConversation";

export interface ReplyVariables {
  conversationId: number;
  body: string;
}

export function useReplyInConversationMutation(
  options: Omit<
    UseMutationOptions<SendMessageResponse, BccApiError, ReplyVariables>,
    "mutationFn"
  > = {},
) {
  const queryClient = useQueryClient();

  return useMutation<SendMessageResponse, BccApiError, ReplyVariables>({
    mutationFn: ({ conversationId, body }) => replyInConversation(conversationId, body),
    ...options,
    onSuccess: (...args) => {
      const [, variables] = args;
      void queryClient.invalidateQueries({
        queryKey: [...CONVERSATION_QUERY_KEY_ROOT, variables.conversationId],
      });
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY_ROOT });
      // Refresh badges immediately so the messages-unread badge updates
      // without waiting up to 8s for the polling tick. The server-side
      // bump in MessagesService::sendMessage means the next fetch is
      // already cache-fresh.
      void queryClient.invalidateQueries({ queryKey: BADGES_QUERY_KEY_ROOT });
      return options.onSuccess?.(...args);
    },
  });
}
