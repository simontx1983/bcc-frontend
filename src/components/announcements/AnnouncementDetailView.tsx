"use client";

/**
 * The canonical announcement page body.
 *
 * This page — not the feed card, not the rotator — owns the discussion.
 * Feed cards link here; they never host a second thread.
 *
 * Archived announcements still render in full: an archive is a public
 * record, not a deletion. The permalink keeps working, the original
 * publication date is preserved, the body is intact and the existing
 * discussion stays readable. Only new writes are closed.
 */

import { BlogMarkdownRenderer } from "@/components/blog/markdown/BlogMarkdownRenderer";
import { AnnouncementComments } from "@/components/announcements/AnnouncementComments";
import { formatAbsoluteDateTime, formatShortDate } from "@/lib/format";
import type { AnnouncementDetail } from "@/lib/api/types";

/**
 * An edit shows an "updated" line only when it is materially later than
 * publication. A few seconds' drift between the publish write and the
 * row's `updated_at` is bookkeeping, not an edit worth announcing.
 */
export const MATERIAL_UPDATE_THRESHOLD_MS = 60_000;

export function isMateriallyUpdated(
  publishedAt: string | null,
  updatedAt: string | null,
): boolean {
  if (publishedAt === null || updatedAt === null) return false;
  const published = Date.parse(publishedAt);
  const updated = Date.parse(updatedAt);
  if (Number.isNaN(published) || Number.isNaN(updated)) return false;
  return updated - published > MATERIAL_UPDATE_THRESHOLD_MS;
}

interface AnnouncementDetailViewProps {
  announcement: AnnouncementDetail;
  validatorName: string;
  viewerAuthed: boolean;
}

export function AnnouncementDetailView({
  announcement,
  validatorName,
  viewerAuthed,
}: AnnouncementDetailViewProps) {
  const {
    id,
    title,
    summary,
    body,
    published_at,
    updated_at,
    is_archived,
    archived_at,
    is_pinned,
  } = announcement;

  const showUpdated = isMateriallyUpdated(published_at, updated_at);

  return (
    <article className="bcc-panel mx-auto max-w-3xl">
      <header className="border-b border-bcc-border px-5 py-6 sm:px-8">
        <p
          className="bcc-mono mb-2 text-safety"
          style={{ fontSize: "10px", letterSpacing: "0.24em" }}
        >
          ANNOUNCEMENT · {validatorName.toUpperCase()}
        </p>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          {is_pinned && !is_archived && (
            <span
              className="bcc-mono text-safety"
              style={{ fontSize: "10px", letterSpacing: "0.24em" }}
            >
              PINNED
            </span>
          )}
          {is_archived && (
            <span
              className="bcc-mono text-bcc-text-secondary"
              style={{ fontSize: "10px", letterSpacing: "0.24em" }}
              data-testid="announcement-detail-archived-flag"
            >
              ARCHIVED
            </span>
          )}
        </div>

        <h1
          className="bcc-stencil text-bcc-text"
          style={{ fontSize: "clamp(1.6rem, 5vw, 2.6rem)", lineHeight: 1.05 }}
        >
          {title}
        </h1>

        <p
          className="font-serif italic text-bcc-text-secondary"
          style={{ fontSize: "17px", lineHeight: 1.5, marginTop: "10px" }}
        >
          {summary}
        </p>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
          {published_at !== null && (
            <time
              dateTime={published_at}
              title={formatAbsoluteDateTime(published_at)}
              className="bcc-mono text-bcc-text-secondary"
              style={{ fontSize: "11px" }}
            >
              {formatShortDate(published_at)}
            </time>
          )}
          {showUpdated && updated_at !== null && (
            <span
              className="bcc-mono text-bcc-text-secondary"
              style={{ fontSize: "11px" }}
              data-testid="announcement-updated-at"
            >
              Updated {formatShortDate(updated_at)}
            </span>
          )}
        </div>
      </header>

      {is_archived && (
        <p
          role="status"
          className="border-b border-bcc-border bg-bcc-surface-raised px-5 py-3 font-serif italic text-bcc-text-secondary sm:px-8"
          style={{ fontSize: "14px" }}
          data-testid="announcement-archived-notice"
        >
          This announcement was archived
          {archived_at !== null ? ` on ${formatShortDate(archived_at)}` : ""}. It stays
          here as a record — its discussion is read-only.
        </p>
      )}

      <div className="px-5 py-6 sm:px-8">
        {/* Markdown SOURCE from the server. BlogMarkdownRenderer escapes
            raw HTML (no rehype-raw) and scheme-filters every URL, so an
            operator typing markup gets literal text, never execution. */}
        <BlogMarkdownRenderer body={body} />
      </div>

      <AnnouncementComments announcementId={id} viewerAuthed={viewerAuthed} />
    </article>
  );
}
