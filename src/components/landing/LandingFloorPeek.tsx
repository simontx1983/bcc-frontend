"use client";

/**
 * LandingFloorPeek — "on the floor now," the bounded 3-post proof-of-life
 * section (handover Item 1). Deliberately NOT the interactive infinite
 * feed: no useInfiniteQuery, no composer, no live reaction rail — a
 * marketing page's job is to convert, and an infinite feed is an exit
 * ramp into context-less scrolling (the exact problem the old FloorIntro
 * was built to solve). The reaction rail here is read-only display; the
 * whole card is the CTA — it links straight to the post permalink, which
 * doubles as the sign-in prompt for an anon click.
 *
 * Graceful-degrade: loading shows lean skeletons, but an empty/error
 * result omits the section entirely rather than showing a broken feed.
 */

import Link from "next/link";
import type { Route } from "next";

import { FlameIcon, ReplyIcon } from "@/components/feed/actionIcons";
import { deriveBodySummary, readString } from "@/components/feed/postBody";
import { RankChip } from "@/components/profile/RankChip";
import { useHotFeedPeek } from "@/hooks/useFeed";
import { formatRelativeTime } from "@/lib/format";
import type { FeedItem } from "@/lib/api/types";

const PEEK_COUNT = 3;

function peekBodyText(item: FeedItem): string {
  const summary = deriveBodySummary(item);
  if (summary !== "") return summary;
  return (
    readString(item.body, "text") ??
    readString(item.body, "excerpt") ??
    readString(item.body, "caption") ??
    ""
  );
}

function PeekCard({ item }: { item: FeedItem }) {
  const name = item.author.display_name ?? item.author.handle;
  const initial = name.trim().charAt(0).toUpperCase() || "?";
  const body = peekBodyText(item);
  const stokeCount = item.reactions.stoke_count ?? 0;

  return (
    <Link href={item.links.self as Route} className="bcc-ldg-pcard">
      <div className="bcc-ldg-pc-head">
        <span className="bcc-ldg-pc-av" aria-hidden>
          {item.author.avatar_url !== undefined && item.author.avatar_url !== "" ? (
            // eslint-disable-next-line @next/next/no-img-element -- remote PeepSo avatar, no per-tenant remotePatterns allow-list
            <img src={item.author.avatar_url} alt="" className="h-full w-full object-cover" />
          ) : (
            initial
          )}
        </span>
        <div className="bcc-ldg-pc-id">
          <div className="bcc-ldg-pc-nm">{name}</div>
          <div className="bcc-ldg-pc-hd">@{item.author.handle}</div>
        </div>
        {item.author.rank_label !== undefined && item.author.rank_label !== null && item.author.rank_label !== "" && (
          <RankChip
            cardTier={item.author.card_tier ?? null}
            tierLabel={item.author.tier_label ?? null}
            rankLabel={item.author.rank_label}
            size="compact"
            className="bcc-ldg-pc-rank"
          />
        )}
      </div>
      {body !== "" && <p className="bcc-ldg-pc-body">{body}</p>}
      <div className="bcc-ldg-pc-rail" aria-hidden>
        <span className="stoke">
          <FlameIcon size={14} color="var(--bcc-secondary)" outline={false} /> Stoke {stokeCount}
        </span>
        <span>
          <ReplyIcon size={14} /> {item.comment_count}
        </span>
        <span>{formatRelativeTime(item.posted_at)}</span>
      </div>
    </Link>
  );
}

function PeekSkeleton() {
  return (
    <div className="bcc-ldg-pcard motion-safe:animate-pulse" aria-hidden>
      <div className="bcc-ldg-pc-head">
        <span className="bcc-ldg-pc-av" style={{ opacity: 0.4 }} />
        <div className="bcc-ldg-pc-id" style={{ flex: 1 }}>
          <div style={{ height: 14, width: "60%", background: "var(--bcc-border)", borderRadius: 4, opacity: 0.6 }} />
          <div style={{ height: 10, width: "40%", background: "var(--bcc-border)", borderRadius: 4, opacity: 0.4, marginTop: 6 }} />
        </div>
      </div>
      <div style={{ height: 12, width: "90%", background: "var(--bcc-border)", borderRadius: 4, opacity: 0.4 }} />
      <div style={{ height: 12, width: "70%", background: "var(--bcc-border)", borderRadius: 4, opacity: 0.4 }} />
    </div>
  );
}

export function LandingFloorPeek() {
  const query = useHotFeedPeek(PEEK_COUNT);

  if (query.isLoading) {
    return (
      <div className="bcc-ldg-peek">
        {Array.from({ length: PEEK_COUNT }).map((_, idx) => (
          <PeekSkeleton key={idx} />
        ))}
      </div>
    );
  }

  const items = query.data?.items ?? [];
  if (query.isError || items.length === 0) {
    return null;
  }

  return (
    <div className="bcc-ldg-peek">
      {items.slice(0, PEEK_COUNT).map((item) => (
        <PeekCard key={item.id} item={item} />
      ))}
    </div>
  );
}
