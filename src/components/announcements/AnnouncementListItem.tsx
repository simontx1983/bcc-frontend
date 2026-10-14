"use client";

/**
 * One announcement row — used by the Active and Archived sections of the
 * Announcements tab.
 *
 * Presentational. Owner affordances are passed in already-resolved from
 * the server capability block; this component never decides who may act.
 *
 * Surface family B (fixed cream/ink paper) to match its siblings in the
 * entity tab strip (CardReviewsPanel / CardWatchersPanel), so text tokens
 * here are `text-ink*` and never the theme-aware `text-bcc-*`.
 */

import { Pin } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { formatShortDate, formatAbsoluteDateTime } from "@/lib/format";
import type { Announcement } from "@/lib/api/types";

interface AnnouncementListItemProps {
  announcement: Announcement;
  /** Rendered under the row. Owner-only; caller resolves the capability. */
  actions?: React.ReactNode;
}

export function AnnouncementListItem({
  announcement,
  actions,
}: AnnouncementListItemProps) {
  const {
    title,
    summary,
    published_at,
    is_pinned,
    is_archived,
    archived_at,
    comment_count,
    links,
  } = announcement;

  return (
    <article
      className="border-b border-cardstock-edge px-5 py-5 last:border-b-0 sm:px-8"
      data-testid="announcement-row"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {/*
          `text-safety` on paper measured 2.95:1, under 4.5:1.
          `text-ink` is the paper family's own and measures 16.92:1; the
          icon keeps the state from being carried by colour alone, and
          matches the same marker now shown in the bar.
        */}
        {is_pinned && !is_archived && (
          <span
            className="bcc-mono inline-flex items-center gap-1 text-ink"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
            data-testid="announcement-row-pinned"
          >
            <Pin size={11} strokeWidth={2} aria-hidden />
            PINNED
          </span>
        )}
        {is_archived && (
          <span
            className="bcc-mono text-ink-ghost"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
            data-testid="announcement-archived-flag"
          >
            ARCHIVED
          </span>
        )}
      </div>

      {/*
        `text-ink` on the heading was never reaching the text: the colour
        is set on the inner <a>, which carried no class and so inherited
        the global theme link colour. Measured theme primary on paper =
        2.08:1, under the 3:1 bar for 22px/800 text. `text-ink` on the
        link itself measures 16.92:1 — the surface's own token, which the
        rest of this file already uses.
      */}
      <h4 className="bcc-stencil" style={{ fontSize: "22px", lineHeight: 1.1 }}>
        <Link href={links.self as Route} className="text-ink hover:underline">
          {title}
        </Link>
      </h4>

      {/* Summary is a required, operator-written field — never derived
          from the body, so it is safe to show verbatim as plain text. */}
      <p
        className="font-serif text-ink-soft"
        style={{ fontSize: "15px", lineHeight: 1.5, marginTop: "6px" }}
      >
        {summary}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {published_at !== null && (
          <time
            dateTime={published_at}
            title={formatAbsoluteDateTime(published_at)}
            className="bcc-mono text-ink-ghost"
            style={{ fontSize: "11px" }}
          >
            {formatShortDate(published_at)}
          </time>
        )}
        {is_archived && archived_at !== null && (
          <span
            className="bcc-mono text-ink-ghost"
            style={{ fontSize: "11px" }}
            data-testid="announcement-archived-at"
          >
            Archived {formatShortDate(archived_at)}
          </span>
        )}
        <span className="bcc-mono text-ink-ghost" style={{ fontSize: "11px" }}>
          {comment_count === 1 ? "1 comment" : `${comment_count} comments`}
        </span>
        {/* Same crossing as PINNED above: 2.95:1 on paper. `text-ink`
            measures 16.92:1 and the underline-on-hover still marks it as
            the way through. */}
        <Link
          href={links.self as Route}
          className="bcc-mono text-ink underline-offset-2 hover:underline"
          style={{ fontSize: "11px", letterSpacing: "0.12em" }}
        >
          READ MORE
        </Link>
      </div>

      {actions !== undefined && actions !== null && (
        <div className="mt-3 flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </article>
  );
}
