"use client";

/**
 * useStartConversation — POST /me/conversations (§4.19).
 *
 * On success: invalidate the inbox roots + the unread-count badge so
 * a brand-new conversation surfaces in both surfaces immediately. The
 * caller typically follows up with `router.push('/messages/' + id)`.
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { startConversation } from "@/lib/api/messages-endpoints";
import type {
  BccApiError,
  SendMessageResponse,
  StartConversationRequest,
} from "@/lib/api/types";
import { BADGES_QUERY_KEY_ROOT } from "@/hooks/useBadges";
import { CONVERSATIONS_QUERY_KEY_ROOT } from "@/hooks/useConversations";

export function useStartConversationMutation(
  options: Omit<
    UseMutationOptions<SendMessageResponse, BccApiError, StartConversationRequest>,
    "mutationFn"
  > = {},
) {
  const queryClient = useQueryClient();

  return useMutation<SendMessageResponse, BccApiError, StartConversationRequest>({
    mutationFn: (req) => startConversation(req),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY_ROOT });
      // Refresh badges immediately so the messages-unread badge picks
      // up the new conversation. Server-side bump already ran inside
      // MessagesService::sendMessage.
      void queryClient.invalidateQueries({ queryKey: BADGES_QUERY_KEY_ROOT });
      return options.onSuccess?.(...args);
    },
  });
}
