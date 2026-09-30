/**
 * Typed announcement fixtures — **TEST USE ONLY**.
 *
 * The backend (bcc-trust A2/A3/A5) does not exist yet, so every shape
 * the UI consumes is asserted here against the types generated from
 * api-contract-v1.md §4.32 as locked in umbrella PR #165.
 *
 * ⚠ These are NOT a runtime fallback. Nothing in `src/app`,
 * `src/components` or `src/hooks` imports this module — the surfaces
 * call the real typed client and let a missing backend read as missing.
 * If this file ever appears in a non-test import, that is a bug: it
 * would make an unbuilt feature look finished.
 *
 * Because they are typed (not `as any`, not hand-rolled JSON), a
 * contract change that lands in `types.ts` breaks these fixtures at
 * compile time — which is the only automated signal the frontend gets,
 * since the parity guard checks PHP routes and never the TS side.
 */

import type {
  Announcement,
  AnnouncementCapabilities,
  AnnouncementComment,
  AnnouncementCommentsResponse,
  AnnouncementDetail,
  AnnouncementListResponse,
  CardPermissionEntry,
} from "@/lib/api/types";

const ALLOW: CardPermissionEntry = { allowed: true, unlock_hint: null, reason_code: null };

function deny(reason: string, hint: string | null = null): CardPermissionEntry {
  return { allowed: false, unlock_hint: hint, reason_code: reason };
}

/** What the resolved operator sees. */
export const OWNER_CAPABILITIES: AnnouncementCapabilities = {
  can_create: ALLOW,
  can_edit: ALLOW,
  can_pin: ALLOW,
  can_archive: ALLOW,
  can_manage_comments: ALLOW,
  can_comment: ALLOW,
};

/** What a signed-in non-owner sees: may comment, may do nothing else. */
export const VISITOR_CAPABILITIES: AnnouncementCapabilities = {
  can_create: deny("not_claimer"),
  can_edit: deny("not_claimer"),
  can_pin: deny("not_claimer"),
  can_archive: deny("not_claimer"),
  can_manage_comments: deny("not_claimer"),
  can_comment: ALLOW,
};

/**
 * An archived announcement's capabilities: the operator keeps moderation
 * (so removed comments stay manageable) but loses edit, pin and comment.
 */
export const ARCHIVED_OWNER_CAPABILITIES: AnnouncementCapabilities = {
  can_create: ALLOW,
  can_edit: deny("announcement_archived"),
  can_pin: deny("announcement_archived"),
  can_archive: deny("already_archived"),
  can_manage_comments: ALLOW,
  can_comment: deny("announcement_archived"),
};

export const PUBLISHED_ANNOUNCEMENT: Announcement = {
  id: "ann_4471",
  title: "Upgrade to v18 complete",
  summary: "Validator upgraded to v18 during the scheduled window. No missed blocks.",
  published_at: "2026-09-28T14:00:00Z",
  updated_at: "2026-09-28T14:00:12Z",
  is_pinned: true,
  is_archived: false,
  archived_at: null,
  comment_count: 2,
  comments_enabled: true,
  links: { self: "/v/blacksmith-node/a/4471" },
};

export const SECOND_ANNOUNCEMENT: Announcement = {
  id: "ann_4470",
  title: "Commission unchanged for Q4",
  summary: "Commission stays at 5% through the end of the year.",
  published_at: "2026-09-10T09:30:00Z",
  updated_at: null,
  is_pinned: false,
  is_archived: false,
  archived_at: null,
  comment_count: 0,
  comments_enabled: true,
  links: { self: "/v/blacksmith-node/a/4470" },
};

export const ARCHIVED_ANNOUNCEMENT: Announcement = {
  id: "ann_4302",
  title: "Migration window — March",
  summary: "Historical notice about the March migration window.",
  published_at: "2026-03-02T08:00:00Z",
  updated_at: null,
  is_pinned: false,
  is_archived: true,
  archived_at: "2026-06-01T12:00:00Z",
  comment_count: 1,
  comments_enabled: false,
  links: { self: "/v/blacksmith-node/a/4302" },
};

/** An edit materially later than publication — drives the "Updated" line. */
export const EDITED_ANNOUNCEMENT_DETAIL: AnnouncementDetail = {
  ...PUBLISHED_ANNOUNCEMENT,
  updated_at: "2026-09-30T11:00:00Z",
  body: "## What changed\n\nThe validator now runs v18.\n\n- No missed blocks\n- No downtime",
  status: "published",
  capabilities: OWNER_CAPABILITIES,
};

export const PUBLISHED_ANNOUNCEMENT_DETAIL: AnnouncementDetail = {
  ...PUBLISHED_ANNOUNCEMENT,
  body: "## What changed\n\nThe validator now runs v18.",
  status: "published",
  capabilities: VISITOR_CAPABILITIES,
};

export const ARCHIVED_ANNOUNCEMENT_DETAIL: AnnouncementDetail = {
  ...ARCHIVED_ANNOUNCEMENT,
  body: "Historical notice body.",
  status: "published",
  capabilities: ARCHIVED_OWNER_CAPABILITIES,
};

export const LIVE_COMMENT: AnnouncementComment = {
  id: "acmt_9910",
  is_removed: false,
  body: "Thanks for the heads up.",
  author: {
    id: 42,
    handle: "simontx",
    display_name: "Simon TX",
    avatar_url: null,
  },
  posted_at: "2026-09-28T15:02:00Z",
  permissions: { can_remove: ALLOW },
};

/** Removed by its own author — one of exactly two server-authored labels. */
export const AUTHOR_TOMBSTONE: AnnouncementComment = {
  id: "acmt_9911",
  is_removed: true,
  removed_at: "2026-09-28T16:10:00Z",
  label: "Comment removed by author",
};

/** Removed by the validator — the other server-authored label. */
export const VALIDATOR_TOMBSTONE: AnnouncementComment = {
  id: "acmt_9912",
  is_removed: true,
  removed_at: "2026-09-29T09:00:00Z",
  label: "Comment removed by validator",
};

export function announcementListResponse(
  items: Announcement[],
  nextCursor: string | null = null,
): AnnouncementListResponse {
  return {
    items,
    pagination: { next_cursor: nextCursor, has_more: nextCursor !== null },
  };
}

export function commentsResponse(
  items: AnnouncementComment[],
  canComment: CardPermissionEntry = ALLOW,
  nextCursor: string | null = null,
): AnnouncementCommentsResponse {
  return {
    items,
    pagination: { next_cursor: nextCursor, has_more: nextCursor !== null },
    can_comment: canComment,
  };
}

export const ARCHIVED_COMMENT_GATE: CardPermissionEntry = deny(
  "announcement_archived",
  null,
);
