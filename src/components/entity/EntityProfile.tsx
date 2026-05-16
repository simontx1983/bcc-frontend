/**
 * EntityProfile — detail surface for validator / project / creator
 * entities. Matches the /u/[handle] shape exactly so the platform reads
 * as one product:
 *
 *   FileRail   (FLOOR // {KIND} · @handle  …  FILE NNNN // OPEN)
 *   <h1>       (stencil clamp 1.75rem–4.5rem, card.name)
 *              @handle kicker in safety orange
 *   PageHero   (card on left, actions cluster on right, StatsStrip below)
 *   EntityTabs (Backing · Activity · On-chain · Chains)
 *
 * Tabs replace the old linear section stack (backing → stats → on-chain →
 * chains → stream). StatsStrip lives in the hero's `belowHero` slot,
 * mirroring how /u/[handle] surfaces CountsStrip there.
 *
 * Reuses the §L5 Card view-model the rest of the app speaks. No new
 * data shape; same fields the legacy two-column hero consumed.
 *
 * What's deferred (Phase 4 polish):
 *   - "Wanted" poster overlay for unclaimed validator pages (server
 *     view-model split already exists; the UI variant is the pending
 *     piece)
 *   - Operator stream feed in the Activity tab (will reuse FeedItemCard
 *     / useFeed once /v/:slug/feed is exposed; today the tab is a §N10
 *     empty state or LockedStreamPanel)
 *   - Reviews tab + per-page reviews list (deferred)
 */

import { CardFactory } from "@/components/cards/CardFactory";
import { ChainTabs } from "@/components/entity/ChainTabs";
import { ClaimCallout } from "@/components/claim/ClaimCallout";
import { DisputeCallout } from "@/components/disputes/DisputeCallout";
import { EndorseButton } from "@/components/endorse/EndorseButton";
import { EntityTabs } from "@/components/entity/EntityTabs";
import { CardDisputesPanel } from "@/components/entity/panels/CardDisputesPanel";
import { CardReviewsPanel } from "@/components/entity/panels/CardReviewsPanel";
import { CardWatchersPanel } from "@/components/entity/panels/CardWatchersPanel";
import { LockedStreamPanel } from "@/components/entity/LockedStreamPanel";
import { FileRail } from "@/components/layout/FileRail";
import { PageHero } from "@/components/layout/PageHero";
import { AttestationActionCluster } from "@/components/profile/AttestationActionCluster";
import { AttestationRoster } from "@/components/profile/AttestationRoster";
import { ReputationSummaryPanel } from "@/components/profile/ReputationSummaryPanel";
import { ReviewCallout } from "@/components/review/ReviewCallout";
import type {
  AttestationTargetKind,
  Card,
  CardKind,
  EntityCardKind,
  OnchainSignals,
} from "@/lib/api/types";
import { isAllowed, unlockHint } from "@/lib/permissions";

/**
 * Map the FE's CardKind to the §J entity tab namespace
 * (`{kind}_card`) used by the new /entities/{kind}/{id}/{tab}
 * endpoints. Returns null for `member` since those cards don't
 * render through EntityProfile.
 */
function cardKindToEntityCardKind(kind: CardKind): EntityCardKind | null {
  switch (kind) {
    case "validator": return "validator_card";
    case "project":   return "project_card";
    case "creator":   return "creator_card";
    case "member":
    default:          return null;
  }
}

/**
 * Map the FE's CardKind to the §4.20 §J target_kind taxonomy for
 * attestation mutations. The "member" CardKind is not a Card target
 * (operator profiles use the user_profile branch in /u/[handle]), so
 * we return null for it — the caller-side guard in the cluster
 * (canMutate) skips the click handler when targetKind is undefined.
 */
function cardKindToAttestationTargetKind(
  kind: CardKind,
): AttestationTargetKind | undefined {
  switch (kind) {
    case "validator":
      return "validator_card";
    case "project":
      return "project_card";
    case "creator":
      return "creator_card";
    case "member":
    default:
      return undefined;
  }
}

export interface EntityProfileProps {
  card: Card;
  /**
   * Per-kind subtitle copy used in the FileRail kicker (e.g.
   * "VALIDATOR", "PROJECT", "CREATOR"). Each entity-route shell passes
   * the right one — keeps the shared component honest about what it
   * doesn't know.
   */
  kindLabel: string;
  /**
   * §N10 empty-state copy for the Activity tab when the page is
   * claimed-but-quiet. Per kind the messaging is slightly different
   * ("This validator hasn't claimed the page yet" vs. "This creator
   * hasn't dropped anything yet"). Used only when card.is_claimed.
   */
  streamEmptyState: { title: string; body: string };
  /**
   * Whether the current viewer has a session. Drives the §N7 visible-
   * but-disabled state on the §N8 Claim CTA — server component reads
   * the session and passes a bool across the RSC boundary.
   */
  viewerAuthed: boolean;
}

export function EntityProfile({
  card,
  kindLabel,
  streamEmptyState,
  viewerAuthed,
}: EntityProfileProps) {
  const targetKind     = cardKindToAttestationTargetKind(card.card_kind);
  const entityCardKind = cardKindToEntityCardKind(card.card_kind);

  return (
    <main className="pb-24">
      {/* ── FileRail ────────────────────────────────────────────────
          Mirrors /u/[handle]: FLOOR // KIND  AT-HANDLE on the left,
          FILE NNNN // STATUS on the right. Status reads "OPEN" for
          claimed entities, "WANTED" for unclaimed ones — same word the
          Phase-4 poster overlay will surface. */}
      <FileRail
        kind={kindLabel}
        subject={card.handle !== "" ? `@${card.handle.toUpperCase()}` : ""}
        fileNumber={String(card.id).padStart(4, "0")}
        status={card.is_claimed === false ? "WANTED" : "OPEN"}
      />

      {/* ── §J page title — large stencil display name above the hero.
          Same vocabulary as /u/[handle]: the trading-card primitive
          carries identity inside its nameplate strip, but a 12px line
          inside a 316px tile isn't a page title. The big name here
          answers "whose page am I on?" without making the viewer
          parse the card. ────────────────────────────────────────── */}
      <header className="mx-auto mt-12 max-w-[1440px] px-4 sm:px-7">
        <h1
          className="bcc-stencil text-cardstock leading-[0.92]"
          style={{ fontSize: "clamp(1.75rem, 5.5vw, 4.5rem)", wordBreak: "break-word" }}
        >
          {card.name}
        </h1>
        {card.handle !== "" && (
          <p
            className="bcc-mono mt-3 text-safety"
            style={{ fontSize: "11px", letterSpacing: "0.18em" }}
          >
            @{card.handle}
          </p>
        )}
      </header>

      {/* ── HERO — unified PageHero shape ───────────────────────────
          card slot: trading card (CardFactory at hero scale, full 316px).
          actions slot: ReputationSummaryPanel + AttestationActionCluster
                        + ClaimCallout + ReviewCallout + EndorseButton
                        + DisputeCallout (the legacy IdentityBlock stack).
          belowHero slot: StatsStrip (lives inside the dotted box, same
                          slot CountsStrip occupies on /u/[handle]). ── */}
      <section className="mt-8">
        <PageHero
          card={
            <div
              className="bcc-stage-reveal"
              style={{ ["--stagger" as string]: "0ms" }}
            >
              <CardFactory card={card} />
            </div>
          }
          actions={
            <div
              className="bcc-stage-reveal flex flex-col gap-3"
              style={{ ["--stagger" as string]: "120ms" }}
            >
              {/* §J.6 reputation-first panel — same component /u/[handle]'s
                  inline reputation cell uses, just sourced from card data. */}
              <ReputationSummaryPanel
                reputationScore={card.reputation_score ?? card.trust_score}
                reliabilityStanding={card.reliability_standing}
                cardTier={card.card_tier}
                tierLabel={card.tier_label}
                rankLabel={card.rank_label ?? ""}
                isInGoodStanding={card.is_in_good_standing}
                flags={card.flags}
                divergenceState={card.negative_signals?.divergence_state}
                underReview={card.negative_signals?.under_review}
                reputationVolatile={card.negative_signals?.volatile}
                unresolvedClaimsCount={card.negative_signals?.unresolved_claims_count}
              />

              {/* Social proof headline — server pre-renders the line. */}
              {card.social_proof?.headline !== undefined &&
                card.social_proof.headline !== null && (
                  <p className="bcc-mono text-sm text-cardstock-deep">
                    {card.social_proof.headline}
                  </p>
                )}

              <AttestationActionCluster
                targetKind={targetKind}
                targetId={card.id}
                canVouch={card.permissions.can_vouch}
                canStandBehind={card.permissions.can_stand_behind}
                canDispute={card.permissions.can_dispute}
                canReport={card.permissions.can_report}
                viewerAttestation={card.viewer_attestation}
                viewerHasEndorsed={card.viewer_has_endorsed}
              />

              {card.is_claimed === false && card.claim_target !== null && (
                <ClaimCallout
                  pageId={card.id}
                  pageName={card.name}
                  target={card.claim_target}
                  viewerAuthed={viewerAuthed}
                />
              )}

              <ReviewCallout
                pageId={card.id}
                pageName={card.name}
                canReview={isAllowed(card.permissions, "can_review")}
                unlockHint={unlockHint(card.permissions, "can_review")}
                hasReviewed={card.viewer_has_reviewed}
                viewerAuthed={viewerAuthed}
              />

              <EndorseButton
                pageId={card.id}
                pageName={card.name}
                canEndorse={isAllowed(card.permissions, "can_endorse")}
                unlockHint={card.endorse_unlock_hint}
                hasEndorsed={card.viewer_has_endorsed}
                viewerAuthed={viewerAuthed}
              />

              <DisputeCallout
                pageId={card.id}
                pageName={card.name}
                canDispute={isAllowed(card.permissions, "can_dispute")}
              />
            </div>
          }
          belowHero={card.stats.length > 0 ? (
            <div>
              <div className="mb-3 flex items-center gap-3">
                <span className="bcc-mono text-cardstock-deep">FILE 04</span>
                <span className="bcc-mono text-safety">{"//"} STATS</span>
              </div>
              <StatsStrip stats={card.stats} />
            </div>
          ) : null}
        />
      </section>

      {/* ── EntityTabs — replaces the old linear section stack ────── */}
      <section className="mx-auto mt-16 max-w-[1440px] px-4 sm:px-7">
        <EntityTabs
          backingPanel={
            <AttestationRoster
              targetKind={targetKind}
              targetId={card.id}
              emptyState={{
                body: "No attestations on file yet. Be the first to vouch.",
              }}
            />
          }
          reviewsPanel={
            entityCardKind !== null ? (
              <CardReviewsPanel
                kind={entityCardKind}
                cardId={card.id}
                cardName={card.name}
              />
            ) : null
          }
          activityPanel={
            card.is_claimed === false ? (
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
            )
          }
          watchersPanel={
            entityCardKind !== null ? (
              <CardWatchersPanel
                kind={entityCardKind}
                cardId={card.id}
                cardName={card.name}
                isClaimed={card.is_claimed === true}
              />
            ) : null
          }
          disputesPanel={
            entityCardKind !== null ? (
              <CardDisputesPanel
                kind={entityCardKind}
                cardId={card.id}
                cardName={card.name}
              />
            ) : null
          }
          onchainPanel={
            card.onchain_signals !== null && card.onchain_signals !== undefined
              ? <OnchainSignalsBlock signals={card.onchain_signals} />
              : null
          }
          chainsPanel={
            card.chains !== null ? <ChainTabs chains={card.chains} /> : null
          }
        />
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// StatsStrip — compact server-formatted stats grid. Same data as the
// CardFactory back face, surfaced at hero scale so the user doesn't
// have to flip the card. Lives inside the PageHero dotted-border box
// (belowHero slot) so it reads as "header stats" not "page section."
// ─────────────────────────────────────────────────────────────────────

function StatsStrip({ stats }: { stats: Card["stats"] }) {
  return (
    <div
      className="bcc-panel grid gap-px overflow-hidden"
      style={{
        gridTemplateColumns: `repeat(${Math.min(stats.length, 6)}, minmax(0,1fr))`,
        background: "rgba(15,13,9,0.08)",
      }}
    >
      {stats.map((stat) => (
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

// ─────────────────────────────────────────────────────────────────────
// OnchainSignalsBlock — table-shaped breakdown of the validator's
// on-chain data (status, uptime, commission, voting rank, stake,
// delegators, last refresh). Same shape as the legacy linear-section
// version; lives in the On-chain tab now.
//
// Each cell self-hides when its value is null so a partially-enriched
// validator doesn't render "—%" placeholders that look like missing UI.
// ─────────────────────────────────────────────────────────────────────

function OnchainSignalsBlock({ signals }: { signals: OnchainSignals }) {
  const cells: Array<{ label: string; value: string }> = [];

  cells.push({ label: "Status", value: formatStatus(signals.status) });

  if (signals.uptime_30d !== null) {
    cells.push({
      label: "Uptime · 30d",
      value: `${(signals.uptime_30d * 100).toFixed(2)}%`,
    });
  }
  if (signals.commission_rate !== null) {
    cells.push({
      label: "Commission",
      value: `${(signals.commission_rate * 100).toFixed(2)}%`,
    });
  }
  if (signals.voting_power_rank !== null) {
    cells.push({
      label: "Voting Rank",
      value: `#${signals.voting_power_rank}`,
    });
  }
  if (signals.total_stake !== null) {
    cells.push({
      label: "Total Stake",
      value: formatStake(signals.total_stake),
    });
  }
  if (signals.self_stake !== null) {
    cells.push({
      label: "Self Stake",
      value: formatStake(signals.self_stake),
    });
  }
  if (signals.delegator_count !== null) {
    cells.push({
      label: "Delegators",
      value: signals.delegator_count.toLocaleString(),
    });
  }
  if (signals.jailed_count !== null && signals.jailed_count > 0) {
    cells.push({
      label: "Jailed Events",
      value: signals.jailed_count.toLocaleString(),
    });
  }

  return (
    <>
      <div
        className="bcc-panel grid gap-px overflow-hidden"
        style={{
          gridTemplateColumns: `repeat(${Math.min(cells.length, 4)}, minmax(0,1fr))`,
          background: "rgba(15,13,9,0.08)",
        }}
      >
        {cells.map((cell) => (
          <div
            key={cell.label}
            className="flex flex-col items-start gap-1 bg-cardstock px-4 py-4"
          >
            <span className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft">
              {cell.label.toUpperCase()}
            </span>
            <span className="bcc-stencil text-xl text-ink">{cell.value}</span>
          </div>
        ))}
      </div>
      {signals.last_fetched_at !== null && (
        <p className="bcc-mono mt-3 text-[10px] tracking-[0.18em] text-cardstock-deep">
          LAST SYNCED · {formatLastFetched(signals.last_fetched_at)}
        </p>
      )}
    </>
  );
}

function formatStatus(status: OnchainSignals["status"]): string {
  switch (status) {
    case "active":
      return "Active";
    case "inactive":
      return "Inactive";
    case "jailed":
      return "Jailed";
    default:
      return "Unknown";
  }
}

// Stake values arrive as strings to preserve Cosmos token precision.
// Render with thousands separators and trim trailing zeros after the
// decimal. Chain-aware token-unit formatting is V1.7; today we surface
// the raw number so operators can sanity-check what the indexer captured.
function formatStake(raw: string): string {
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return raw;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toLocaleString(undefined, {
      maximumFractionDigits: 2,
    })}M`;
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })}K`;
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

function formatLastFetched(iso: string): string {
  const ts = Date.parse(iso);
  if (!Number.isFinite(ts)) {
    return iso;
  }
  const minutesAgo = Math.max(0, Math.floor((Date.now() - ts) / 60_000));
  if (minutesAgo < 1) {
    return "just now";
  }
  if (minutesAgo < 60) {
    return `${minutesAgo}m ago`;
  }
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) {
    return `${hoursAgo}h ago`;
  }
  const daysAgo = Math.floor(hoursAgo / 24);
  return `${daysAgo}d ago`;
}
