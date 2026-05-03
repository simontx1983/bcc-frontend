/**
 * Typed wrappers for /me/notifications/* endpoints (§I1).
 *
 * All routes auth-required — anonymous viewers never have
 * notifications. Use bccFetchAsClient so NextAuth attaches the
 * Bearer token automatically; 401s auto-trigger sign-out via the
 * client's standard handling.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  NotificationsListResponse,
  NotificationsMarkReadResponse,
  NotificationsUnreadCountResponse,
} from "@/lib/api/types";

export interface NotificationsListParams {
  /** Last-seen notification id (exclusive cursor). Omit for first page. */
  cursor?: string | null;
  /** 1..50; defaults to 20 server-side. */
  limit?: number;
}

export function getNotifications(
  params: NotificationsListParams,
  signal?: AbortSignal
): Promise<NotificationsListResponse> {
  const search = new URLSearchParams();
  if (params.cursor !== undefined && params.cursor !== null && params.cursor !== "") {
    search.set("cursor", params.cursor);
  }
  if (params.limit !== undefined) {
    search.set("limit", String(params.limit));
  }
  const qs = search.toString();
  const path = qs === "" ? "me/notifications" : `me/notifications?${qs}`;
  return bccFetchAsClient<NotificationsListResponse>(path, {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}

export function getUnreadCount(
  signal?: AbortSignal
): Promise<NotificationsUnreadCountResponse> {
  return bccFetchAsClient<NotificationsUnreadCountResponse>(
    "me/notifications/unread-count",
    {
      method: "GET",
      ...(signal !== undefined ? { signal } : {}),
    }
  );
}

/**
 * Mark a single notification read (when `id` is given) or every
 * unread notification for the viewer (when `id` is omitted).
 *
 * Idempotent — calling on an already-read row is a no-op success.
 */
export function markNotificationsRead(
  id?: number
): Promise<NotificationsMarkReadResponse> {
  return bccFetchAsClient<NotificationsMarkReadResponse>(
    "me/notifications/mark-read",
    {
      method: "POST",
      body: id !== undefined ? { id } : {},
    }
  );
}
