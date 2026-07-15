"use client";

/**
 * MoreFromAuthor — right-rail widget on the post detail view. Shows up to
 * two OTHER recent posts by the same author, with a "view more" link to
 * their profile. Renders nothing when the author has no other posts, so
 * the rail stays quiet for one-off posters (a dynamic, not fixed, card).
 *
 * Reuses the existing per-user activity feed (`useUserActivity`) — same
 * one-author slice the profile page renders — so no new backend.
 */

import type { Route } from "next";
import Link from "next/link";

import { AuthorBadge } from "@/components/identity/AuthorBadge";
import { Skeleton } from "@/components/ui/Skeleton";
import { deriveBodySummary, readString } from "@/components/feed/postBody";
import { useUserActivity } from "@/hooks/useUserActivity";
import type { FeedItem } from "@/lib/api/types";

const MAX_ROWS = 2;

export function MoreFromAuthor({
  handle,
  authorName,
  excludeFeedId,
}: {
  handle: string;
  authorName: string;
  excludeFeedId: string;
}) {
  const { data, isLoading } = useUserActivity(handle);

  const items = (data?.pages[0]?.items ?? [])
    .filter((i) => i.id !== excludeFeedId)
    .slice(0, MAX_ROWS);

  if (isLoading) {
    return (
      <div className="bcc-widget">
        <div className="bcc-widget-head">More from {authorName}</div>
        <div className="bcc-widget-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <Skeleton className="h-10" count={2} />
        </div>
      </div>
    );
  }

  // Dynamic: only render when this author actually has other posts.
  if (items.length === 0) return null;

  return (
    <div className="bcc-widget">
      <div className="bcc-widget-head">More from {authorName}</div>
      <div className="bcc-widget-body flex flex-col gap-2.5">
        {items.map((item) => (
          <MoreRow key={item.id} item={item} />
        ))}
        <Link
          href={`/u/${handle}` as Route}
          // Matches the Follow button's outline treatment (B10) — outline,
          // not a highlight fill.
          className="bcc-btn bcc-btn-sm bcc-btn-outline mt-0.5 w-full"
        >
          View more →
        </Link>
      </div>
    </div>
  );
}

/**
 * A miniaturised feed post: the same identity header as the main feed
 * (avatar + name/handle stack, via AuthorBadge → so the hover card works
 * here too) over a short body preview + optional media thumbnail. No
 * reaction rail — this is a compact pointer, not an interactive row.
 */
function MoreRow({ item }: { item: FeedItem }) {
  // deriveBodySummary() returns "" for photo/gif posts (their caption
  // lives in body.caption, rendered by the feed card's PhotoBody/GifBody
  // — this mini row has no such renderer, so fall back to the caption
  // directly instead of silently dropping it behind the thumbnail.
  const summary = deriveBodySummary(item) || readString(item.body, "caption") || "";
  const mediaUrl =
    readString(item.body, "photo_url") ?? readString(item.body, "gif_url") ?? "";

  return (
    <div className="rounded-xl border border-[var(--bcc-border)] p-2.5">
      {/* No hover card (the full author card is right above this widget)
          and no rank chip (visible up there too) — keeps the mini clean.
          text-[13px] tightens the name so name+handle ≈ the avatar height
          (B9) instead of inheriting the looser body size. */}
      <AuthorBadge
        author={item.author}
        size="sm"
        hovercard={false}
        showRank={false}
        avatarRingColor="var(--bcc-accent)"
        className="text-[13px]"
      />
      <Link href={item.links.self as Route} className="mt-2 block">
        {summary !== "" && (
          <p className="line-clamp-2 font-serif text-[12px] leading-snug text-[var(--bcc-text)]">
            {summary}
          </p>
        )}
        {mediaUrl !== "" && (
          // eslint-disable-next-line @next/next/no-img-element -- remote feed media
          <img
            src={mediaUrl}
            alt=""
            className="mt-1.5 h-20 w-full rounded-md border border-[var(--bcc-border)] object-cover"
            loading="lazy"
          />
        )}
      </Link>
    </div>
  );
}
