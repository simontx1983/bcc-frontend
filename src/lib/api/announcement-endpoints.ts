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
 *   - any fallback endpoint, retry-against-a-different-path, or local
 *     stub (restated: a missing backend must read as missing).
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
  AnnouncementStatus,
  OwnerAnnouncementListResponse,
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
export interface ListOwnerAnnouncementsParams {
  pageId: number;
  /**
   * Which lifecycle bucket. The route's enum is
   * `draft | scheduled | blocked | published`, and omitting it is NOT the
   * same as asking for everything — the server's default is the
   * unpublished set. So this wrapper requires it: a caller that wants
   * published rows has to say so.
   */
  status: AnnouncementStatus;
  cursor?: string | undefined;
  limit?: number | undefined;
}

/**
 * GET /me/validators/:pageId/announcements — the OWNER-scoped list.
 *
 * ⚠ This is the only list that carries per-row `capabilities`. The public
 * list deliberately carries none, for any viewer including the operator —
 * §4.32 enforces that with two distinct producers rather than a flag, and
 * an operator's public list is byte-identical to an anonymous one. So a
 * management control cannot be driven from the public list at all; it has
 * to come from here (or from detail, one row at a time).
 *
 * `published` was added to the route's enum by bcc-trust #341 precisely so
 * this surface could exist. Before that the enum was unpublished-only, and
 * a published announcement's row capabilities were reachable *nowhere* in
 * list form.
 *
 * ⚠ Operator-only: a non-operator gets `403 not_claimer`, and an anonymous
 * viewer gets 403 as well. Never call it speculatively — gate on the
 * page-scope `can_manage` the Card advertises.
 */
export async function listOwnerAnnouncements(
  params: ListOwnerAnnouncementsParams,
): Promise<OwnerAnnouncementListResponse> {
  const { pageId, status, cursor, limit } = params;
  const search = new URLSearchParams();
  search.set("status", status);
  if (limit !== undefined) {
    search.set("limit", String(limit));
  }
  if (cursor !== undefined && cursor !== "") {
    search.set("cursor", cursor);
  }
  return bccFetchAsClient<OwnerAnnouncementListResponse>(
    `me/${announcementsRoot(pageId)}?${search.toString()}`,
    { method: "GET" },
  );
}

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
 * POST /validators/:pageId/announcements/:id/publish.
 *
 * The ONLY route that transitions an existing row. `status` is declared
 * on the create route alone, and the editable route refuses it —
 * `PATCH {status}` answers 400 "Nothing to change", leaving the row a
 * draft. So a draft reaches `published` through here or not at all.
 *
 * ⚠ The route itself is gated: it re-resolves operator authority per
 * request rather than trusting the token, so a revoked operator gets
 * `403 not_claimer` on the same bearer that worked a moment earlier.
 * What the capability block was missing is only the FIELD a client reads
 * to decide whether to draw the control — `can_publish`, added by
 * bcc-trust #343. A client that ignores it is refused by the route, not
 * admitted by it.
 *
 * Scheduled rows do not need this: the backend's own guard promotes them
 * at their due time. It exists for a draft, and for publishing a
 * scheduled row EARLY.
 */
export async function publishAnnouncement(
  pageId: number,
  announcementId: string,
): Promise<Announcement> {
  return bccFetchAsClient<Announcement>(
    // Bare numeric id: the route matches `\d+` and the wire hands callers
    // the prefixed `ann_<n>` view-model form. The general fix for this
    // across every path lives on the billboard branch as `pathId()`; this
    // call reconciles to it when the branches meet.
    `${announcementsRoot(pageId)}/${String(announcementId).replace(/^ann_/, "")}/publish`,
    { method: "POST" },
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
 * POST /validators/:pageId/announcements/:id/pin.
 *
 * One pinned announcement per validator — pinning a second atomically
 * unpins the first server-side, so the client never has to sequence two
 * calls (and cannot leave two pinned if the second fails).
 *
 * ⚠ The direction travels in the BODY, as a required boolean, not in the
 * HTTP verb. This previously sent POST to pin and DELETE to unpin with no
 * body, which is wrong in both directions: the route is registered
 * `WP_REST_Server::CREATABLE` only — there is no DELETE verb to answer an
 * unpin — and a POST without `pinned` is refused outright. Measured
 * against the real backend:
 *
 *     POST …/39/pin  (no body)        → 400 Missing parameter(s): pinned
 *     POST …/39/pin  {"pinned": true} → 200
 *
 * It went unnoticed because the only control that calls this was never
 * reachable: row capabilities were read from a list that cannot carry
 * them, so every pin button rendered permanently disabled. Correcting
 * that sourcing is what exposed the write underneath it.
 */
export function setAnnouncementPin(
  pageId: number,
  announcementId: string,
  pinned: boolean,
): Promise<Announcement> {
  return bccFetchAsClient<Announcement>(
    `${announcementsRoot(pageId)}/${encodeURIComponent(announcementId)}/pin`,
    { method: "POST", body: { pinned } },
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

/** How many announcements the bar may ever show (contract §4.32.4). */
export const ROTATOR_MAX_ITEMS = 5;

/**
 * GET /validators/:pageId/announcements/rotator — the bounded set the
 * announcement bar shows.
 *
 * Distinct from the list route on purpose. The server owns both the
 * bound and the order: pinned first when one exists, then newest first.
 * The client re-sorts nothing and reconstructs no links — it renders
 * what it was handed, in the order it was handed.
 *
 * Reuses the list envelope rather than inventing a second shape; the
 * response is bounded, so `pagination` is inert here and never read.
 */
export function getAnnouncementRotator(
  pageId: number,
): Promise<AnnouncementListResponse> {
  return bccFetchAsClient<AnnouncementListResponse>(
    `${announcementsRoot(pageId)}/rotator`,
    { method: "GET" },
  );
}
