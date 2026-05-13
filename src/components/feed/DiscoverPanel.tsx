"use client";

/**
 * DiscoverPanel — §F5 / Sprint 3 cold-start bridge surface.
 *
 * Mounts inside FeedView's empty state branch. CIVIC MAP, NOT a
 * recommendation engine. The room is showing the operator that it's
 * still here and offering three paths forward — locals to join,
 * operators recently active, posts that have been happening.
 *
 * ─────────────────────────────────────────────────────────────────────
 * LOCKED PHRASES — do not edit without re-running the constitutional
 * audit. Each phrase is one editor's "small copy improvement" away
 * from drift.
 *
 *   - "Quiet on the Floor"                       — kept from prior empty state
 *   - "The room's still here. Three places to start."  — civic, present-tense, no urgency
 *   - "LOCALS YOU MIGHT JOIN"                    — "might join" is suggestion, not CTA
 *   - "RECENTLY ACTIVE OPERATORS"                — recency, not ranking
 *   - "WHAT'S BEEN HAPPENING"                    — past-tense, NOT "happening now" or "hot"
 *   - "VIEW MORE ON THE FLOOR →"                 — navigation, not "see more"
 *   - "The floor's just opening up. Check back soon."  — honest terminal state
 *
 * Equally locked: what each phrase MUST NOT become.
 *   - LOCALS YOU MIGHT JOIN     ✗ "RECOMMENDED" / "POPULAR" / "FOR YOU"
 *   - RECENTLY ACTIVE OPERATORS ✗ "TOP" / "TRUSTED" / "WORTH WATCHING" / "TO FOLLOW"
 *   - WHAT'S BEEN HAPPENING     ✗ "HOT" / "TRENDING" / "LIVE NOW"
 *
 * Equally locked: what this surface MUST NOT grow.
 *   - No metrics displayed beside operators (follower count, review
 *     count, reputation score, etc.).
 *   - No follow / save / favorite affordances on operator rows.
 *   - No "Load more." Counts are bounded.
 *   - No analytics on click-through, time-spent, per-operator
 *     surfacing count, or per-block performance.
 *   - No A/B test infrastructure.
 *
 * If the operators block ever ranks, personalizes, or grows: retire
 * it before the other two — it is the highest-drift-risk block.
 * ─────────────────────────────────────────────────────────────────────
 *
 * Failure modes:
 *   - loading → render the original "Quiet on the Floor" fallback
 *     (silent on the cold-start blocks; no skeleton — the surface is
 *     supplementary).
 *   - error   → same fallback. A failed cold-start call shouldn't
 *     block the empty state.
 *   - all three blocks empty → "The floor's just opening up.
 *     Check back soon." terminal copy.
 */

import { memo } from "react";

import type { Route } from "next";
import Link from "next/link";

import { Avatar } from "@/components/identity/Avatar";
import { FeedItemCard } from "@/components/feed/FeedItemCard";
import { RankChip } from "@/components/profile/RankChip";
import { useColdStart } from "@/hooks/useColdStart";
import type {
  ColdStartLocal,
  ColdStartOperator,
  ColdStartResponse,
} from "@/lib/api/types";

interface DiscoverPanelProps {
  /** Parent passes `feed.items.length === 0` — gate mounting here. */
  enabled: boolean;
}

function DiscoverPanelImpl({ enabled }: DiscoverPanelProps) {
  const query = useColdStart({ enabled });

  // Silent failure / loading. The empty state stays civic on its own
  // ("Quiet on the Floor") regardless of whether the cold-start
  // blocks load.
  if (!enabled || query.isLoading || query.isError) {
    return <QuietOnTheFloorPanel />;
  }

  const data = query.data;
  if (data === undefined) {
    return <QuietOnTheFloorPanel />;
  }

  const allEmpty =
    data.locals.length === 0 &&
    data.recent_operators.length === 0 &&
    data.hot_posts.length === 0;

  if (allEmpty) {
    return <QuietOnTheFloorPanel terminal />;
  }

  return (
    <section
      aria-label="Three places to start"
      className="mx-auto mt-2 max-w-3xl px-4 sm:px-6"
    >
      <div className="bcc-panel flex flex-col gap-0 overflow-hidden">
        <header className="px-5 py-4">
          <h2 className="bcc-stencil text-2xl text-ink">Quiet on the Floor</h2>
          <p className="font-serif text-ink-soft">
            The room&apos;s still here. {composeKicker(data)}
          </p>
        </header>

        {data.locals.length > 0 && (
          <BlockSection
            label="LOCALS YOU MIGHT JOIN"
            viewAllHref={"/locals" as Route}
          >
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {data.locals.map((local) => (
                <LocalCard key={local.slug} local={local} />
              ))}
            </ul>
          </BlockSection>
        )}

        {data.recent_operators.length > 0 && (
          <BlockSection
            label="RECENTLY ACTIVE OPERATORS"
            viewAllHref={"/members" as Route}
          >
            <ul className="flex flex-col">
              {data.recent_operators.map((op) => (
                <OperatorRow key={op.handle} op={op} />
              ))}
            </ul>
          </BlockSection>
        )}

        {data.hot_posts.length > 0 && (
          <BlockSection label="WHAT'S BEEN HAPPENING" viewAllHref={null}>
            <div className="flex flex-col gap-3">
              {data.hot_posts.map((item) => (
                <FeedItemCard key={item.id} item={item} />
              ))}
            </div>
            <div className="mt-3 flex justify-end">
              {/*
                "VIEW MORE ON THE FLOOR" routes back into the home feed
                with the hot-bucket query string the FE doesn't have to
                interpret — the server merges hot into /feed/for_you.
                Refresh of the empty-state mount point shows the feed
                with whatever has accumulated, which is the honest
                "more on the floor" path.
              */}
              <button
                type="button"
                onClick={() => query.refetch()}
                className="bcc-mono text-[10px] tracking-[0.18em] text-blueprint hover:underline"
              >
                Refresh the floor →
              </button>
            </div>
          </BlockSection>
        )}
      </div>
    </section>
  );
}

export const DiscoverPanel = memo(DiscoverPanelImpl);
DiscoverPanel.displayName = "DiscoverPanel";

// ─────────────────────────────────────────────────────────────────────
// Kicker copy — adapts to the number of populated blocks so the
// "Three places to start" promise doesn't read broken if one or two
// blocks happen to be empty server-side.
// ─────────────────────────────────────────────────────────────────────

function composeKicker(data: ColdStartResponse): string {
  const filled =
    (data.locals.length > 0 ? 1 : 0) +
    (data.recent_operators.length > 0 ? 1 : 0) +
    (data.hot_posts.length > 0 ? 1 : 0);
  if (filled === 3) return "Three places to start.";
  if (filled === 2) return "A couple of places to start.";
  if (filled === 1) return "Here's where the floor is alive today.";
  // filled === 0 is handled by the terminal-state branch above.
  return "";
}

// ─────────────────────────────────────────────────────────────────────
// Empty/loading/error fallback — mirrors the prior empty-state shape
// so a cold-start endpoint failure leaves the page coherent. Terminal
// branch flips the copy when the cold-start endpoint succeeded but
// returned zero items across all three blocks (genuine floor-quiet).
// ─────────────────────────────────────────────────────────────────────

function QuietOnTheFloorPanel({ terminal }: { terminal?: boolean }) {
  return (
    <div className="py-12">
      <div className="bcc-panel mx-auto max-w-md p-6 text-center">
        <h2 className="bcc-stencil text-2xl text-ink">Quiet on the Floor</h2>
        <p className="mt-2 font-serif text-ink-soft">
          {terminal === true
            ? "The floor's just opening up. Check back soon."
            : "Keep tabs on a card or two to start your feed, or check back in a bit — new activity rolls in throughout the day."}
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// BlockSection — rail-accented labelled block. Mirrors HighlightStrip's
// "What to know" separator-with-rail header pattern so the cold-start
// panel feels of-a-piece with the rest of the Floor.
// ─────────────────────────────────────────────────────────────────────

interface BlockSectionProps {
  label: string;
  viewAllHref: Route | null;
  children: React.ReactNode;
}

function BlockSection({ label, viewAllHref, children }: BlockSectionProps) {
  return (
    <section className="border-t border-cardstock-edge/40 px-5 py-4 first:border-t-0">
      <header className="bcc-mono mb-3 flex items-center gap-3 text-cardstock-deep">
        <span className="inline-block h-px w-6 bg-cardstock-edge/50" />
        <span className="text-[10px] tracking-[0.2em]">{label}</span>
        <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
        {viewAllHref !== null && (
          <Link
            href={viewAllHref}
            className="bcc-mono shrink-0 text-[10px] tracking-[0.16em] text-blueprint hover:underline"
          >
            View all →
          </Link>
        )}
      </header>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// LocalCard — mini-card for the Locals block. Click → /locals/[slug].
//
// Deliberately quiet — no chain glyph, no member-count chip styled as
// a metric badge. Just name + chain + tally as plain text under a
// thin chain-color accent on the left edge.
// ─────────────────────────────────────────────────────────────────────

function LocalCard({ local }: { local: ColdStartLocal }) {
  return (
    <li>
      <Link
        href={`/locals/${local.slug}` as Route}
        className="bcc-panel block px-3 py-3 transition hover:bg-cardstock-deep/5"
        style={{
          borderLeft: `3px solid var(--chain-${local.chain_slug}, var(--cardstock-edge))`,
        }}
      >
        <span className="bcc-stencil block truncate text-sm text-ink">
          {local.name}
        </span>
        <span className="bcc-mono mt-1 block text-[10px] tracking-[0.14em] text-ink-soft">
          {local.chain_slug.toUpperCase()} · {local.member_count}{" "}
          {local.member_count === 1 ? "member" : "members"}
        </span>
      </Link>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────
// OperatorRow — recently-active operator entry. Click → /u/[handle].
//
// LOAD-BEARING: no metrics, no follow button, no review-count, no
// reputation-score. Avatar + handle + server-rendered recent_action +
// rank chip (earned identity, not ranking — RankChip's tier rail
// encodes the §C1 tier color, which is identity not standing).
// ─────────────────────────────────────────────────────────────────────

function OperatorRow({ op }: { op: ColdStartOperator }) {
  return (
    <li>
      <Link
        href={op.link as Route}
        className="flex items-center gap-3 border-b border-cardstock-edge/30 px-1 py-2.5 transition last:border-b-0 hover:bg-cardstock-deep/5"
      >
        <Avatar
          avatarUrl={op.avatar_url === "" ? null : op.avatar_url}
          handle={op.handle}
          displayName={op.display_name}
          size="sm"
          variant="rounded"
          tier={op.card_tier === null ? undefined : op.card_tier}
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="bcc-stencil truncate text-sm text-ink">
            {op.display_name !== "" ? op.display_name : `@${op.handle}`}
          </span>
          <span className="bcc-mono truncate text-[10px] tracking-[0.12em] text-ink-soft">
            {op.recent_action}
          </span>
        </div>
        {op.rank_label !== "" && (
          <RankChip
            cardTier={op.card_tier}
            tierLabel={op.tier_label}
            rankLabel={op.rank_label}
            size="compact"
            className="shrink-0"
          />
        )}
      </Link>
    </li>
  );
}
