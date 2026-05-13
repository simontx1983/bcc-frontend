/**
 * EntityProfile — minimum-viable detail surface for validator /
 * project / creator entities (per Phase 4 of the §Plan).
 *
 * Reuses the §L5 Card view-model the rest of the app already speaks.
 * The same view-model that powers the polymorphic <CardFactory> in
 * the feed — here we render it at hero scale, plus an identity
 * strip, a stats panel, and a per-kind stream placeholder.
 *
 * What's deferred (Phase 4 polish):
 *   - "Wanted" poster overlay + locked stream gating for unclaimed
 *     validator pages (the unclaimed/claimed view-model split is
 *     already on the server; the UI variant is the deferred part)
 *   - Operator stream feed (will reuse FeedItemCard / useFeed once
 *     /v/:slug/feed is exposed; today the panel is a §N10 empty state)
 *   - Reviews list + Letters from the Floor (creator + validator)
 *   - Gallery for creators (Phase 6 — needs the NFT indexer)
 *   - Claim flow (the four-step §N8 modal — separate component)
 *
 * What ships now: a real destination for every "View →" link in the
 * app, grounded in real data. Click-throughs stop 404'ing.
 */

import { CardFactory } from "@/components/cards/CardFactory";
import { ChainTabs } from "@/components/entity/ChainTabs";
import { ClaimCallout } from "@/components/claim/ClaimCallout";
import { DisputeCallout } from "@/components/disputes/DisputeCallout";
import { EndorseButton } from "@/components/endorse/EndorseButton";
import { LockedStreamPanel } from "@/components/entity/LockedStreamPanel";
import { ReviewCallout } from "@/components/review/ReviewCallout";
import type { Card } from "@/lib/api/types";
import { isAllowed } from "@/lib/permissions";

export interface EntityProfileProps {
  card: Card;
  /**
   * Per-kind subtitle copy for the hero block. Each entity-route
   * shell passes the right one — e.g. /v passes "Validator", /c
   * passes "NFT Creator". Keeps the shared component honest about
   * what it doesn't know.
   */
  kindLabel: string;
  /**
   * §N10 empty-state copy for the stream placeholder. Per kind the
   * messaging is slightly different ("This validator hasn't claimed
   * the page yet" vs. "This creator hasn't dropped anything yet").
   */
  streamEmptyState: { title: string; body: string };
  /**
   * Whether the current viewer has a session. Drives the §N7 visible-
   * but-disabled state on the §N8 Claim CTA — server component reads
   * the session and passes a bool across the RSC boundary.
   */
  viewerAuthed: boolean;
}

export function EntityProfile({ card, kindLabel, streamEmptyState, viewerAuthed }: EntityProfileProps) {
  return (
    <main className="pb-24">
      {/* ── Hero ────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1560px] px-7 pt-12">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[minmax(316px,340px)_1fr]">
          <div
            className="bcc-stage-reveal"
            style={{ ["--stagger" as string]: "0ms" }}
          >
            <CardFactory card={card} />
          </div>

          <IdentityBlock
            card={card}
            kindLabel={kindLabel}
            viewerAuthed={viewerAuthed}
          />
        </div>
      </section>

      {/* ── Stats strip ─────────────────────────────────────────── */}
      <section className="mx-auto mt-12 max-w-[1560px] px-7">
        <StatsPanel card={card} />
      </section>

      {/* ── §K3 Cross-chain identity strip — mounts only when this
            operator runs on 2+ chains and has linked wallets to the
            same peepso-page. Self-hides when card.chains is null. ── */}
      {card.chains !== null && (
        <section className="mx-auto max-w-[1560px] px-7">
          <ChainTabs chains={card.chains} />
        </section>
      )}

      {/* ── Stream slot — §N8/§B5 locked treatment when unclaimed,
            §N10 empty state when claimed-but-quiet. The real feed
            wires in once /v/:slug/feed exposes operator posts. ──── */}
      <section className="mx-auto mt-12 max-w-[1560px] px-7">
        <div className="bcc-mono mb-4 flex items-center gap-3 text-cardstock-deep">
          <span className="inline-block h-px w-8 bg-cardstock-edge/50" />
          <span>The Stream</span>
          <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
        </div>
        {card.is_claimed === false ? (
          <LockedStreamPanel pageName={card.name} />
        ) : (
          <div className="bcc-panel mx-auto max-w-2xl p-8 text-center">
            <h2 className="bcc-stencil text-2xl text-ink">
              {streamEmptyState.title}
            </h2>
            <p className="mt-2 font-serif text-ink-soft">
              {streamEmptyState.body}
            </p>
          </div>
        )}
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// IdentityBlock — name + handle + tier ribbon + flags strip beside the
// hero card. Reads pre-formatted fields from the view-model; no
// derivations (per §A2).
// ─────────────────────────────────────────────────────────────────────

function IdentityBlock({
  card,
  kindLabel,
  viewerAuthed,
}: {
  card: Card;
  kindLabel: string;
  viewerAuthed: boolean;
}) {
  return (
    <div
      className="bcc-stage-reveal"
      style={{ ["--stagger" as string]: "120ms" }}
    >
      <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
        {kindLabel.toUpperCase()}
      </span>

      <h1 className="bcc-stencil mt-2 text-5xl text-cardstock md:text-6xl">
        {card.name}
      </h1>

      <p className="bcc-mono mt-2 text-cardstock-deep">@{card.handle}</p>

      {/* Tier + rank + good-standing seal — three small badges in a row.
          Each is server-pre-formatted and only renders when populated. */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {card.tier_label !== null && card.card_tier !== null && (
          <span
            className="bcc-mono rounded-sm px-2 py-1 text-[10px] tracking-[0.18em]"
            style={{
              color: `var(--tier-${card.card_tier})`,
              background: "rgba(15,13,9,0.04)",
              border: "1px solid rgba(15,13,9,0.12)",
            }}
          >
            {card.tier_label.toUpperCase()}
          </span>
        )}

        {card.rank_label !== null && (
          <span
            className="bcc-mono rounded-sm px-2 py-1 text-[10px] tracking-[0.18em] text-ink"
            style={{
              background: "rgba(15,13,9,0.06)",
              border: "1px solid rgba(15,13,9,0.16)",
            }}
          >
            {card.rank_label.toUpperCase()}
          </span>
        )}

        {card.is_in_good_standing && (
          <span
            className="bcc-mono rounded-sm px-2 py-1 text-[10px] tracking-[0.18em]"
            style={{
              color: "var(--verified)",
              background: "rgba(44,157,102,0.10)",
              border: "1px solid rgba(44,157,102,0.32)",
            }}
          >
            ✓ IN GOOD STANDING
          </span>
        )}
      </div>

      {/* Flags strip — only renders when the server has surfaced any.
          Server already filters which flags are visible per viewer. */}
      {card.flags.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {card.flags.map((flag) => (
            <li
              key={flag}
              className="bcc-mono rounded-sm px-2 py-1 text-[10px] tracking-[0.18em] text-safety"
              style={{ background: "rgba(240,90,40,0.08)", border: "1px solid rgba(240,90,40,0.32)" }}
            >
              {flag.toUpperCase()}
            </li>
          ))}
        </ul>
      )}

      {/* Social proof headline — server pre-renders the line. */}
      {card.social_proof?.headline !== undefined &&
        card.social_proof.headline !== null && (
          <p className="bcc-mono mt-5 text-sm text-cardstock-deep">
            {card.social_proof.headline}
          </p>
        )}

      {/* §N8 Claim flow entry — only when the page is unclaimed AND a
          claim target resolves on the server. Anonymous viewers see
          the CTA disabled with a sign-in tooltip. */}
      {card.is_claimed === false && card.claim_target !== null && (
        <ClaimCallout
          pageId={card.id}
          pageName={card.name}
          target={card.claim_target}
          viewerAuthed={viewerAuthed}
        />
      )}

      {/* §D2 Write-a-review entry — visible on every entity profile.
          Disabled with explanatory tooltip when the viewer hasn't
          unlocked reviews (Level 2 + reputation tier ≥ neutral).
          When the viewer already has a review on file, the CTA flips
          to "REMOVE YOUR REVIEW" with a confirm gate. */}
      <ReviewCallout
        pageId={card.id}
        pageName={card.name}
        canReview={isAllowed(card.permissions, "can_review")}
        hasReviewed={card.viewer_has_reviewed}
        viewerAuthed={viewerAuthed}
      />

      {/* §V1.5 Endorse entry — server resolves can_endorse via
          EndorsementService::getEndorseEligibility (identity quest +
          account age + fraud-score gates). When the viewer has already
          endorsed, the CTA flips to "REMOVE ENDORSEMENT" with a
          confirm gate. */}
      <EndorseButton
        pageId={card.id}
        pageName={card.name}
        canEndorse={isAllowed(card.permissions, "can_endorse")}
        unlockHint={card.endorse_unlock_hint}
        hasEndorsed={card.viewer_has_endorsed}
        viewerAuthed={viewerAuthed}
      />

      {/* §D5 Open-a-dispute entry — owner-only. Server returns the
          {allowed, ...} Permission shape; the callout self-hides when
          allowed=false (anonymous viewers, non-owners, owners who
          haven't unlocked disputes). */}
      <DisputeCallout
        pageId={card.id}
        pageName={card.name}
        canDispute={isAllowed(card.permissions, "can_dispute")}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// StatsPanel — compact server-formatted stats table. Same data as the
// CardFactory back face, surfaced here at the page level so the user
// can scan it without flipping the card.
// ─────────────────────────────────────────────────────────────────────

function StatsPanel({ card }: { card: Card }) {
  if (card.stats.length === 0) {
    return null;
  }

  return (
    <div
      className="bcc-panel grid gap-px overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${Math.min(card.stats.length, 6)}, minmax(0,1fr))`,
        background: "rgba(15,13,9,0.08)",
      }}
    >
      {card.stats.map((stat) => (
        <div
          key={stat.key}
          className="flex flex-col items-start gap-1 bg-cardstock px-4 py-4"
        >
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft">
            {stat.label.toUpperCase()}
          </span>
          <span className="bcc-stencil text-2xl text-ink">{stat.value}</span>
        </div>
      ))}
    </div>
  );
}
