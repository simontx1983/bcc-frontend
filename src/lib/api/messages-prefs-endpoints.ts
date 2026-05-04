/**
 * §V2 Phase 2 — typed wrappers for /me/messages-prefs.
 *
 * Backend: MyMessagesPrefsEndpoint @ /wp-json/bcc/v1. Standard BCC
 * envelope. Auth required.
 *
 * Two operations:
 *   - getMessagesPrefs   → GET (read both flags)
 *   - patchMessagesPrefs → PATCH (partial update; missing keys untouched)
 *
 * Storage: PeepSo's peepso_chat_enabled + peepso_chat_friends_only
 * user_meta keys, read by peepso-messages/classes/chatmodel.php to
 * gate direct message delivery.
 */

import { bccFetchAsClient } from "@/lib/api/client";

export interface MessagesPrefs {
  /** Master on/off for incoming direct messages. */
  chat_enabled: boolean;
  /** When true, only confirmed PeepSo friends can message you. */
  chat_friends_only: boolean;
}

export type PatchMessagesPrefsBody = Partial<MessagesPrefs>;

export function getMessagesPrefs(signal?: AbortSignal): Promise<MessagesPrefs> {
  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (signal !== undefined) init.signal = signal;
  return bccFetchAsClient<MessagesPrefs>("me/messages-prefs", init);
}

export function patchMessagesPrefs(
  body: PatchMessagesPrefsBody,
): Promise<MessagesPrefs> {
  return bccFetchAsClient<MessagesPrefs>("me/messages-prefs", {
    method: "PATCH",
    body,
  });
}
