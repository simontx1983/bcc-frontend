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
import { CONVERSATIONS_QUERY_KEY_ROOT } from "@/hooks/useConversations";
import { UNREAD_MESSAGE_COUNT_QUERY_KEY } from "@/hooks/useUnreadMessageCount";

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
      void queryClient.invalidateQueries({ queryKey: UNREAD_MESSAGE_COUNT_QUERY_KEY });
      return options.onSuccess?.(...args);
    },
  });
}
