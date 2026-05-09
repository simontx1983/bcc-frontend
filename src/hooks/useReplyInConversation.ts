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
import { CONVERSATIONS_QUERY_KEY_ROOT } from "@/hooks/useConversations";
import { CONVERSATION_QUERY_KEY_ROOT } from "@/hooks/useConversation";
import { UNREAD_MESSAGE_COUNT_QUERY_KEY } from "@/hooks/useUnreadMessageCount";

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
      void queryClient.invalidateQueries({ queryKey: UNREAD_MESSAGE_COUNT_QUERY_KEY });
      return options.onSuccess?.(...args);
    },
  });
}
