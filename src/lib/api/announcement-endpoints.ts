/**
 * Typed wrappers for validator announcements (api-contract-v1.md §4.32).
 *
 * ⚠ **NONE OF THESE ROUTES EXIST YET.** The backend half is bcc-trust
 * A2 (CRUD/pin/archive) and A5 (comments). Until those ship every call
 * here resolves to a 404 from WordPress — which is the correct and
 * intended behaviour, because no surface calls them unless the server
 * first advertised the capability block (see `AnnouncementsBlock`).
 *
 * Deliberately NOT here:
 *   - any fallback endpoint, retry-against-a-different-path, or local
 *     stub. A missing backend must read as missing.
 *   - the `/rotator` route. That is F2 (the announcement bar) and is
 *     out of scope for F1.
 *
 * Same idiom as `comment-endpoints.ts`: thin typed glue over the shared
 * client, no envelope hand-parsing, cursor threading left to the hooks.
 */

import { bccFetch, bccFetchAsClient } from "@/lib/api/client";
import type {
  Announcement,
  AnnouncementCommentsResponse,
  AnnouncementDetail,
  AnnouncementListResponse,
  AnnouncementListState,
  CreateAnnouncementCommentRequest,
  CreateAnnouncementRequest,
  UpdateAnnouncementRequest,
} from "@/lib/api/types";

/** Shared path root so a contract change lands in exactly one place. */
function announcementsRoot(pageId: number): string {
  return `validators/${encodeURIComponent(String(pageId))}/announcements`;
}

export interface ListAnnouncementsParams {
  pageId: number;
  state?: AnnouncementListState | undefined;
  cursor?: string | undefined;
  limit?: number | undefined;
}

/** GET /validators/:pageId/announcements — cursor page of active or archived. */
export function listAnnouncements(
  params: ListAnnouncementsParams,
): Promise<AnnouncementListResponse> {
  const { pageId, state, cursor, limit } = params;
  const search = new URLSearchParams();
  if (state !== undefined) {
    search.set("state", state);
  }
  if (limit !== undefined) {
    search.set("limit", String(limit));
  }
  if (cursor !== undefined && cursor !== "") {
    search.set("cursor", cursor);
  }
  const qs = search.toString();
  return bccFetchAsClient<AnnouncementListResponse>(
    `${announcementsRoot(pageId)}${qs ? `?${qs}` : ""}`,
    { method: "GET" },
  );
}

/**
 * GET /validators/:pageId/announcements/:id — server-safe read for the
 * canonical detail page.
 *
 * An announcement that is not yet public (draft, scheduled-not-due, or
 * published-without-a-valid-authorization-marker) returns **404 to
 * non-owners, never 403** — a 403 would confirm the row exists. The
 * caller maps that straight to `notFound()`.
 *
 * Never cached: the response carries a viewer-specific capability block,
 * so a shared cache entry could hand one viewer another's owner controls.
 */
export function getAnnouncement(
  pageId: number,
  announcementId: string,
  token: string | null,
): Promise<AnnouncementDetail> {
  return bccFetch<AnnouncementDetail>(
    `${announcementsRoot(pageId)}/${encodeURIComponent(announcementId)}`,
    { method: "GET", token },
  );
}

/** Browser twin of {@link getAnnouncement}. */
export function getAnnouncementAsClient(
  pageId: number,
  announcementId: string,
): Promise<AnnouncementDetail> {
  return bccFetchAsClient<AnnouncementDetail>(
    `${announcementsRoot(pageId)}/${encodeURIComponent(announcementId)}`,
    { method: "GET" },
  );
}

/**
 * POST /validators/:pageId/announcements — create.
 *
 * Wire mapping worth knowing: the client type calls the field `mode`
 * because it is a request VERB (draft / publish / schedule), while the
 * contract names the wire field `status`. Keeping them distinct stops
 * `mode` being confused with `AnnouncementStatus`, which is the row's
 * resulting STATE and includes values (`blocked`) no client may request.
 *
 * `publish_at` is sent only for `schedule`, and the server is the sole
 * authority on whether it is far enough in the future — the composer's
 * own check is UX, not a gate.
 */
export function createAnnouncement(
  pageId: number,
  request: CreateAnnouncementRequest,
): Promise<AnnouncementDetail> {
  const body: {
    title: string;
    summary: string;
    body: string;
    status: string;
    comments_enabled: boolean;
    publish_at?: string;
  } = {
    title: request.title,
    summary: request.summary,
    body: request.body,
    status: request.mode,
    comments_enabled: request.comments_enabled,
  };
  if (request.mode === "schedule" && request.publish_at !== undefined) {
    body.publish_at = request.publish_at;
  }
  return bccFetchAsClient<AnnouncementDetail>(announcementsRoot(pageId), {
    method: "POST",
    body,
  });
}

/** PATCH /validators/:pageId/announcements/:id — edit. 409 once archived. */
export function updateAnnouncement(
  pageId: number,
  announcementId: string,
  request: UpdateAnnouncementRequest,
): Promise<AnnouncementDetail> {
  return bccFetchAsClient<AnnouncementDetail>(
    `${announcementsRoot(pageId)}/${encodeURIComponent(announcementId)}`,
    { method: "PATCH", body: request },
  );
}

/**
 * POST /validators/:pageId/announcements/:id/archive — one-way in v1.
 *
 * Archiving is NOT deletion: the permalink, the original publication
 * date and the whole discussion survive. It unpins, withdraws the feed
 * activity, and cannot be undone.
 */
export function archiveAnnouncement(
  pageId: number,
  announcementId: string,
): Promise<AnnouncementDetail> {
  return bccFetchAsClient<AnnouncementDetail>(
    `${announcementsRoot(pageId)}/${encodeURIComponent(announcementId)}/archive`,
    { method: "POST" },
  );
}

/**
 * POST | DELETE /validators/:pageId/announcements/:id/pin.
 *
 * One pinned announcement per validator — pinning a second atomically
 * unpins the first server-side, so the client never has to sequence two
 * calls (and cannot leave two pinned if the second fails).
 */
export function setAnnouncementPin(
  pageId: number,
  announcementId: string,
  pinned: boolean,
): Promise<Announcement> {
  return bccFetchAsClient<Announcement>(
    `${announcementsRoot(pageId)}/${encodeURIComponent(announcementId)}/pin`,
    { method: pinned ? "POST" : "DELETE" },
  );
}

export interface ListAnnouncementCommentsParams {
  announcementId: string;
  cursor?: string | undefined;
  limit?: number | undefined;
}

/**
 * GET /announcements/:id/comments — the canonical chronological
 * discussion, **oldest first** and flat. v1 has no nested replies, so
 * there is no `parent` parameter.
 */
export function listAnnouncementComments(
  params: ListAnnouncementCommentsParams,
): Promise<AnnouncementCommentsResponse> {
  const { announcementId, cursor, limit } = params;
  const search = new URLSearchParams();
  if (limit !== undefined) {
    search.set("limit", String(limit));
  }
  if (cursor !== undefined && cursor !== "") {
    search.set("cursor", cursor);
  }
  const qs = search.toString();
  return bccFetchAsClient<AnnouncementCommentsResponse>(
    `announcements/${encodeURIComponent(announcementId)}/comments${qs ? `?${qs}` : ""}`,
    { method: "GET" },
  );
}

/** POST /announcements/:id/comments — plain text only; no Markdown, no replies. */
export function createAnnouncementComment(
  request: CreateAnnouncementCommentRequest,
): Promise<{ comment: AnnouncementCommentsResponse["items"][number] }> {
  return bccFetchAsClient<{ comment: AnnouncementCommentsResponse["items"][number] }>(
    `announcements/${encodeURIComponent(request.announcementId)}/comments`,
    { method: "POST", body: { body: request.body } },
  );
}

export interface RemoveAnnouncementCommentParams {
  announcementId: string;
  commentId: string;
}

/**
 * DELETE /announcements/:id/comments/:commentId — soft removal.
 *
 * Authorized for the comment's own author OR the resolved validator
 * operator. The server decides which label the resulting tombstone
 * carries; the client never composes removal copy and never infers the
 * actor. An operator removing their OWN comment is recorded as an
 * author removal, so the client cannot predict the label either.
 */
export function removeAnnouncementComment(
  params: RemoveAnnouncementCommentParams,
): Promise<{ comment_id: string }> {
  const { announcementId, commentId } = params;
  return bccFetchAsClient<{ comment_id: string }>(
    `announcements/${encodeURIComponent(announcementId)}/comments/${encodeURIComponent(commentId)}`,
    { method: "DELETE" },
  );
}
