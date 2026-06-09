"use client";

/**
 * RightSidebar — persistent right column.
 *
 * Contains:
 *   - Top Directories widget (placeholder — wire to API later)
 *   - Trending hashtags widget
 *   - Suggested members widget
 *   - Ads slot
 *
 * TODO: Replace static placeholder data with TanStack Query hooks
 * once Phase 2 API integration begins. (Trending block: DONE — wired to
 * useTrendingHashtags. Top Directories / Suggested remain placeholder.)
 */

import Link from "next/link";

import { Skeleton } from "@/components/ui/Skeleton";
import { useTrendingHashtags } from "@/hooks/useTrendingHashtags";

// ── Placeholder data ──────────────────────────────────────────────────────────

const TOP_DIRECTORIES = [
  { slug: "injective-validators", name: "Injective Validators", count: 48, tier: "legendary" },
  { slug: "cosmos-operators",     name: "Cosmos Operators",     count: 34, tier: "rare"      },
  { slug: "floor-crew",           name: "Floor Crew",           count: 27, tier: "uncommon"  },
] as const;

const SUGGESTED_MEMBERS = [
  { handle: "operator_01", tier: "legendary" },
  { handle: "validator_x", tier: "rare"      },
  { handle: "floor_crew",  tier: "uncommon"  },
] as const;

// ── Component ─────────────────────────────────────────────────────────────────

export function RightSidebar() {
  return (
    <div className="bcc-sidebar-inner">

      {/* ── Top Directories ── */}
      <div className="bcc-widget">
        <div className="bcc-widget-head">Top Directories</div>
        <div className="bcc-widget-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {TOP_DIRECTORIES.map(({ slug, name, count, tier }) => (
            <Link
              key={slug}
              href={`/directory?filter=${slug}`}
              style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}
            >
              {/* Tier color dot */}
              <span style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: `var(--bcc-tier-${tier})`,
                flexShrink: 0,
              }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="bcc-truncate" style={{
                  display: "block",
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--bcc-text)",
                }}>
                  {name}
                </span>
                <span className="bcc-mono bcc-text-muted" style={{ fontSize: 11 }}>
                  {count} operators
                </span>
              </span>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden
                style={{ color: "var(--bcc-text-muted)", flexShrink: 0 }}>
                <path d="M5 3l4 4-4 4" stroke="currentColor" strokeWidth="1.4"
                  strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </Link>
          ))}
          <Link
            href="/directory"
            style={{
              fontSize: 12,
              fontFamily: "var(--font-mono), monospace",
              color: "var(--bcc-accent)",
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              marginTop: 4,
            }}
          >
            View all →
          </Link>
        </div>
      </div>

      {/* ── Trending hashtags ── */}
      <TrendingWidget />

      {/* ── Suggested members ── */}
      <div className="bcc-widget">
        <div className="bcc-widget-head">Suggested</div>
        <div className="bcc-widget-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {SUGGESTED_MEMBERS.map(({ handle, tier }) => (
            <Link
              key={handle}
              href={`/u/${handle}`}
              style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}
            >
              <span
                className="bcc-avatar bcc-avatar--sm bcc-stencil"
                style={{ borderColor: `var(--bcc-tier-${tier})` }}
              >
                {handle.slice(0, 2).toUpperCase()}
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="bcc-truncate" style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--bcc-text)" }}>
                  @{handle}
                </span>
                <span className="bcc-mono bcc-text-muted" style={{ fontSize: 11, textTransform: "capitalize" }}>
                  {tier}
                </span>
              </span>
              <span className="bcc-btn bcc-btn-sm bcc-btn-ghost" style={{ flexShrink: 0, fontSize: 12, padding: "3px 10px" }}>
                Follow
              </span>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Ad slot ── */}
      <div
        className="bcc-widget"
        style={{
          minHeight: 100,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <span className="bcc-mono bcc-text-muted" style={{ fontSize: 11 }}>
          AD SLOT
        </span>
      </div>

    </div>
  );
}

// ── Trending hashtags widget ────────────────────────────────────────────────
//
// Wired to GET /bcc/v1/hashtags/trending via useTrendingHashtags. Rows
// render in server order (no client-side ranking). On loading: two
// muted skeleton chips (reduced-motion safe via SKELETON_CLASS). On
// error or empty result: render nothing — the widget hides gracefully
// rather than showing an empty frame or a placeholder count.

function TrendingWidget() {
  const { data, isLoading, isError } = useTrendingHashtags();
  const tags = data?.items ?? [];

  if (isLoading) {
    return (
      <div className="bcc-widget">
        <div className="bcc-widget-head">Trending</div>
        <div className="bcc-hashtag-cloud">
          <Skeleton className="h-6 w-20" count={4} />
        </div>
      </div>
    );
  }

  if (isError || tags.length === 0) {
    return null;
  }

  return (
    <div className="bcc-widget">
      <div className="bcc-widget-head">Trending</div>
      <div className="bcc-hashtag-cloud">
        {tags.map(({ tag, count }) => (
          <Link
            key={tag}
            href={`/t/${encodeURIComponent(tag)}`}
            className="bcc-hashtag"
            title={`${count} posts`}
          >
            #{tag}
          </Link>
        ))}
      </div>
    </div>
  );
}
