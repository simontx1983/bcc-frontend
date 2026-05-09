"use client";

/**
 * useMarkConversationRead — POST /me/conversations/{id}/read (§4.19).
 *
 * Used by the inbox row's "mark read" affordance. The thread-open path
 * already marks read as a side-effect of GET, so this is for the
 * "scroll past unread without opening" case.
 */

import {
  useMutation,
  useQueryClient,
  type UseMutationOptions,
} from "@tanstack/react-query";

import { markConversationRead } from "@/lib/api/messages-endpoints";
import type { BccApiError } from "@/lib/api/types";
import { CONVERSATIONS_QUERY_KEY_ROOT } from "@/hooks/useConversations";
import { UNREAD_MESSAGE_COUNT_QUERY_KEY } from "@/hooks/useUnreadMessageCount";

export function useMarkConversationReadMutation(
  options: Omit<
    UseMutationOptions<{ ok: true }, BccApiError, number>,
    "mutationFn"
  > = {},
) {
  const queryClient = useQueryClient();

  return useMutation<{ ok: true }, BccApiError, number>({
    mutationFn: (id) => markConversationRead(id),
    ...options,
    onSuccess: (...args) => {
      void queryClient.invalidateQueries({ queryKey: CONVERSATIONS_QUERY_KEY_ROOT });
      void queryClient.invalidateQueries({ queryKey: UNREAD_MESSAGE_COUNT_QUERY_KEY });
      return options.onSuccess?.(...args);
    },
  });
}
