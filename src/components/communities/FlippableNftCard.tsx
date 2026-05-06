"use client";

/**
 * FlippableNftCard — discovery card for NFT-type groups (§4.7.4).
 *
 * Front face: cover image + cream info panel pinned at the bottom (the
 * existing card visual). NO hover-slide on flippable cards — clicking
 * gives the user the back face instead, so an additional hover gesture
 * would compete for the same affordance.
 *
 * Back face: market data from `collection_stats` — floor, holders,
 * supply distribution, lifetime volume, listed %, royalty %, token
 * standard. Bottom of the back is an explicit "Open community →" link
 * that navigates (stopping propagation so the card doesn't flip back
 * before the navigation fires).
 *
 * Accessibility:
 *   - The card is a `role="button"` toggle (`aria-pressed` reflects
 *     flipped state) with Enter/Space keyboard handling — div + role
 *     instead of <button> so the back face's Link is valid HTML
 *     (anchors-in-buttons is invalid).
 *   - The link inside the back face stops propagation so it navigates
 *     instead of toggling the flip.
 *   - Reduced-motion users get an instant flip (no transition); the
 *     back/front swap still works because backface-visibility hides
 *     the inactive face.
 */

import Link from "next/link";
import type { Route } from "next";
import { useState } from "react";

import { CommunityCover } from "@/components/communities/CommunityCover";
import { HeatBadge } from "@/components/groups/HeatBadge";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import type {
  CollectionStats,
  GroupDiscoveryItem,
} from "@/lib/api/types";

interface FlippableNftCardProps {
  item: GroupDiscoveryItem;
  /** Where the back face's "Open community" link points. */
  href: Route;
}

export function FlippableNftCard({ item, href }: FlippableNftCardProps) {
  const stats = item.collection_stats;
  const [flipped, setFlipped] = useState(false);
  const toggle = () => setFlipped((f) => !f);

  // Stats are required to be on the back; if they're somehow null at
  // render time the parent should not have routed to this component —
  // belt-and-braces: render the front-only state.
  if (stats === null) {
    return <FrontOnly item={item} href={href} />;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={flipped}
      aria-label={
        flipped
          ? `${item.name} — stats. Click to flip back.`
          : `${item.name}. Click to see collection stats.`
      }
      onClick={toggle}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      }}
      className={
        "group relative block aspect-square cursor-pointer " +
        "[perspective:1000px] " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cardstock focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
      }
    >
      <div
        className={
          "relative h-full w-full [transform-style:preserve-3d] " +
          "motion-safe:transition-transform motion-safe:duration-500 " +
          (flipped ? "[transform:rotateY(180deg)]" : "")
        }
      >
        <FrontFace item={item} />
        <BackFace item={item} stats={stats} href={href} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Front face — cover + static cream info panel (no hover-slide).
// ─────────────────────────────────────────────────────────────────────

function FrontFace({ item }: { item: GroupDiscoveryItem }) {
  return (
    <div
      className={
        "absolute inset-0 overflow-hidden border-2 border-cardstock-edge/40 bg-cardstock-deep/40 " +
        "[backface-visibility:hidden]"
      }
    >
      <CommunityCover
        imageUrl={item.image_url}
        name={item.name}
        groupId={item.group_id}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-cardstock px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
            HOLDERS
          </span>
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
            TAP FOR STATS
          </span>
        </div>

        <h2 className="bcc-stencil mt-2 line-clamp-2 text-lg text-ink">
          {item.name}
        </h2>

        {item.verification !== null && (
          <p className="bcc-mono mt-2 text-[10px]">
            <VerificationBadge label={item.verification.label} />
          </p>
        )}

        <div className="mt-2 flex items-center justify-between">
          <span className="bcc-mono text-[10px] text-ink-soft">
            {item.member_count.toLocaleString()} member{item.member_count === 1 ? "" : "s"}
          </span>
          <HeatBadge activity={item.activity} />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Back face — formatted collection_stats + explicit nav link.
// ─────────────────────────────────────────────────────────────────────

function BackFace({
  item,
  stats,
  href,
}: {
  item: GroupDiscoveryItem;
  stats: CollectionStats;
  href: Route;
}) {
  return (
    <div
      className={
        "absolute inset-0 overflow-hidden border-2 border-cardstock-edge/40 bg-cardstock px-5 py-4 " +
        "[backface-visibility:hidden] [transform:rotateY(180deg)]"
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="bcc-mono text-[10px] tracking-[0.18em] text-blueprint">
          STATS
        </span>
        {stats.token_standard !== null && (
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
            {stats.token_standard}
          </span>
        )}
      </div>

      <h2 className="bcc-stencil mt-2 line-clamp-2 text-lg text-ink">
        {item.name}
      </h2>

      {item.description !== null && (
        <p className="font-serif mt-2 line-clamp-2 text-[12px] italic leading-snug text-ink-soft">
          {item.description}
        </p>
      )}

      <dl className="mt-3 space-y-1.5 text-[12px]">
        {stats.floor_display !== null && (
          <Row label="Floor" value={stats.floor_display} />
        )}
        {stats.volume_display !== null && (
          <Row label="Volume" value={stats.volume_display} />
        )}
        {stats.holders_display !== null && (
          <Row label="Holders" value={stats.holders_display} />
        )}
        {stats.supply_display !== null && (
          <Row label="Supply" value={stats.supply_display} />
        )}
        {stats.listed_display !== null && (
          <Row label="Listed" value={stats.listed_display} />
        )}
        {stats.royalty_display !== null && (
          <Row label="Royalty" value={stats.royalty_display} />
        )}
      </dl>

      {(stats.min_balance_display !== null || stats.marketplace !== null) && (
        <p className="bcc-mono absolute inset-x-5 bottom-14 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.14em] text-ink-soft">
          {stats.min_balance_display !== null && (
            <span>Requires {stats.min_balance_display}</span>
          )}
          {stats.min_balance_display !== null && stats.marketplace !== null && (
            <span aria-hidden className="text-cardstock-edge">·</span>
          )}
          {stats.marketplace !== null && (
            <a
              href={stats.marketplace.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-blueprint hover:underline focus-visible:outline-none focus-visible:underline"
            >
              View on {stats.marketplace.label} ↗
            </a>
          )}
        </p>
      )}

      <Link
        href={href}
        onClick={(e) => e.stopPropagation()}
        className={
          "bcc-mono absolute inset-x-5 bottom-4 inline-flex items-center justify-center " +
          "border-2 border-ink bg-ink py-2 text-[11px] tracking-[0.18em] text-cardstock " +
          "hover:bg-ink/80 " +
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blueprint focus-visible:ring-offset-2 focus-visible:ring-offset-cardstock"
        }
      >
        OPEN COMMUNITY →
      </Link>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="bcc-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
        {label}
      </dt>
      <dd className="bcc-mono text-[12px] text-ink">{value}</dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Fallback: card with stats === null. Renders as a non-flipping front,
// linking straight to href. Should never trigger in practice (the
// parent only mounts FlippableNftCard when stats is non-null) — but
// we render gracefully rather than crashing.
// ─────────────────────────────────────────────────────────────────────

function FrontOnly({ item, href }: { item: GroupDiscoveryItem; href: Route }) {
  return (
    <Link
      href={href}
      className={
        "group relative block aspect-square overflow-hidden border-2 border-cardstock-edge/40 bg-cardstock-deep/40 " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cardstock focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
      }
    >
      <CommunityCover
        imageUrl={item.image_url}
        name={item.name}
        groupId={item.group_id}
      />
      <div className="absolute inset-x-0 bottom-0 h-1/2 bg-cardstock px-5 py-4">
        <h2 className="bcc-stencil text-lg text-ink">{item.name}</h2>
      </div>
    </Link>
  );
}

