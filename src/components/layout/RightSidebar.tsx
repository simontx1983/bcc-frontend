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
 * once Phase 2 API integration begins.
 */

import Link from "next/link";

// ── Placeholder data ──────────────────────────────────────────────────────────

const TOP_DIRECTORIES = [
  { slug: "injective-validators", name: "Injective Validators", count: 48, tier: "legendary" },
  { slug: "cosmos-operators",     name: "Cosmos Operators",     count: 34, tier: "rare"      },
  { slug: "floor-crew",           name: "Floor Crew",           count: 27, tier: "uncommon"  },
] as const;

const TRENDING_TAGS = [
  { tag: "validators",       count: 142 },
  { tag: "dispute",          count: 98  },
  { tag: "reputation",       count: 87  },
  { tag: "cosmos",           count: 74  },
  { tag: "injective",        count: 61  },
  { tag: "panel",            count: 55  },
  { tag: "nft",              count: 49  },
  { tag: "bluecollarcrypto", count: 44  },
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
      <div className="bcc-widget">
        <div className="bcc-widget-head">Trending</div>
        <div className="bcc-hashtag-cloud">
          {TRENDING_TAGS.map(({ tag, count }) => (
            <Link
              key={tag}
              href={`/members?q=%23${tag}`}
              className="bcc-hashtag"
              title={`${count} posts`}
            >
              #{tag}
            </Link>
          ))}
        </div>
      </div>

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
