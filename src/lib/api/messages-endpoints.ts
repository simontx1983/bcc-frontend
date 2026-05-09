/**
 * §4.19 typed client for the Direct Messages REST surface.
 *
 * Sibling shape to `messages-prefs-endpoints.ts` — every call rides
 * `bccFetchAsClient`, which auto-attaches the Bearer JWT + handles
 * the canonical envelope (data / error). Auth is required on every
 * route; anonymous calls return `bcc_unauthorized 401`.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  ConversationListResponse,
  ConversationThreadResponse,
  SendMessageResponse,
  StartConversationRequest,
  UnreadMessageCountResponse,
} from "@/lib/api/types";

export interface ListConversationsParams {
  page?: number;
  perPage?: number;
}

export function listConversations(
  params: ListConversationsParams = {},
  signal?: AbortSignal,
): Promise<ConversationListResponse> {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.perPage !== undefined) search.set("per_page", String(params.perPage));
  const qs = search.toString();
  const path = `me/conversations${qs !== "" ? `?${qs}` : ""}`;
  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (signal !== undefined) init.signal = signal;
  return bccFetchAsClient<ConversationListResponse>(path, init);
}

/**
 * POST /me/conversations — start a 1-on-1 OR append to the existing
 * 1-on-1 between sender and recipient. Backend's find-or-create
 * guarantees idempotency: the response's `is_new_conversation`
 * surfaces which path ran (the frontend uses it to decide whether to
 * navigate to a new id or reuse the current view).
 */
export function startConversation(
  request: StartConversationRequest,
): Promise<SendMessageResponse> {
  return bccFetchAsClient<SendMessageResponse>("me/conversations", {
    method: "POST",
    body: request,
  });
}

export interface GetConversationParams {
  page?: number;
  perPage?: number;
}

/**
 * GET /me/conversations/{id}/messages — paginated thread. The server
 * also marks every unread message in the conversation as viewed for
 * the current user as a side-effect of this read (typical "open thread
 * → mark read" stays one round-trip).
 */
export function getConversation(
  id: number,
  params: GetConversationParams = {},
  signal?: AbortSignal,
): Promise<ConversationThreadResponse> {
  const search = new URLSearchParams();
  if (params.page !== undefined) search.set("page", String(params.page));
  if (params.perPage !== undefined) search.set("per_page", String(params.perPage));
  const qs = search.toString();
  const path = `me/conversations/${id}/messages${qs !== "" ? `?${qs}` : ""}`;
  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (signal !== undefined) init.signal = signal;
  return bccFetchAsClient<ConversationThreadResponse>(path, init);
}

export function replyInConversation(
  id: number,
  body: string,
): Promise<SendMessageResponse> {
  return bccFetchAsClient<SendMessageResponse>(`me/conversations/${id}/messages`, {
    method: "POST",
    body: { body },
  });
}

export function markConversationRead(id: number): Promise<{ ok: true }> {
  return bccFetchAsClient<{ ok: true }>(`me/conversations/${id}/read`, {
    method: "POST",
  });
}

export function getUnreadMessageCount(
  signal?: AbortSignal,
): Promise<UnreadMessageCountResponse> {
  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (signal !== undefined) init.signal = signal;
  return bccFetchAsClient<UnreadMessageCountResponse>("me/messages/unread-count", init);
}
