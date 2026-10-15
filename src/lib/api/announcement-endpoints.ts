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
import { BccApiError } from "@/lib/api/types";
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

/**
 * Announcement and comment ids on the WIRE are prefixed view-model values —
 * `ann_36`, `acmt_21`. The ROUTES take bare numerics (`\d+`). Interpolating
 * the prefixed form produces a URL that matches no route and comes back as a
 * flat 404, which reads exactly like "this announcement does not exist".
 *
 * That is not hypothetical: every surface that built a path from a payload
 * id — the whole comment thread, comment create and remove, and the owner
 * pin/archive/edit actions — requested `/announcements/ann_36/comments` and
 * got a 404, while the detail route happened to work because the page hands
 * it the raw route segment instead of a payload value. Mocked endpoint tests
 * could not see it: they assert on the arguments, and the arguments were
 * right. Only the real backend has an opinion about the URL.
 *
 * So the strip lives HERE, at the single layer that owns URL construction,
 * rather than at each of the eight call sites.
 *
 * A value that is not numeric after stripping is a contract violation, not
 * something to paper over with a request that cannot succeed: it throws
 * rather than sending a URL we know is wrong.
 */
function pathId(id: string | number, kind: "announcement" | "comment"): string {
  const raw = String(id).trim();
  const bare = raw.replace(/^(?:ann_|acmt_)/, "");
  if (!/^\d+$/.test(bare)) {
    throw new BccApiError(
      "bcc_invalid_request",
      `Unusable ${kind} id: ${raw}`,
      400,
      null,
    );
  }
  return bare;
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
export async function getAnnouncement(
  pageId: number,
  announcementId: string,
  token: string | null,
): Promise<AnnouncementDetail> {
  return bccFetch<AnnouncementDetail>(
    `${announcementsRoot(pageId)}/${pathId(announcementId, "announcement")}`,
    { method: "GET", token },
  );
}

/** Browser twin of {@link getAnnouncement}. */
export async function getAnnouncementAsClient(
  pageId: number,
  announcementId: string,
): Promise<AnnouncementDetail> {
  return bccFetchAsClient<AnnouncementDetail>(
    `${announcementsRoot(pageId)}/${pathId(announcementId, "announcement")}`,
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
export async function updateAnnouncement(
  pageId: number,
  announcementId: string,
  request: UpdateAnnouncementRequest,
): Promise<AnnouncementDetail> {
  return bccFetchAsClient<AnnouncementDetail>(
    `${announcementsRoot(pageId)}/${pathId(announcementId, "announcement")}`,
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
export async function archiveAnnouncement(
  pageId: number,
  announcementId: string,
): Promise<AnnouncementDetail> {
  return bccFetchAsClient<AnnouncementDetail>(
    `${announcementsRoot(pageId)}/${pathId(announcementId, "announcement")}/archive`,
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
export async function setAnnouncementPin(
  pageId: number,
  announcementId: string,
  pinned: boolean,
): Promise<Announcement> {
  return bccFetchAsClient<Announcement>(
    `${announcementsRoot(pageId)}/${pathId(announcementId, "announcement")}/pin`,
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
export async function listAnnouncementComments(
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
    `announcements/${pathId(announcementId, "announcement")}/comments${qs ? `?${qs}` : ""}`,
    { method: "GET" },
  );
}

/** POST /announcements/:id/comments — plain text only; no Markdown, no replies. */
export async function createAnnouncementComment(
  request: CreateAnnouncementCommentRequest,
): Promise<{ comment: AnnouncementCommentsResponse["items"][number] }> {
  return bccFetchAsClient<{ comment: AnnouncementCommentsResponse["items"][number] }>(
    `announcements/${pathId(request.announcementId, "announcement")}/comments`,
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
export async function removeAnnouncementComment(
  params: RemoveAnnouncementCommentParams,
): Promise<{ comment_id: string }> {
  const { announcementId, commentId } = params;
  return bccFetchAsClient<{ comment_id: string }>(
    `announcements/${pathId(announcementId, "announcement")}/comments/${pathId(commentId, "comment")}`,
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
