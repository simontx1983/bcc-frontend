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
import { AttestationActionCluster } from "@/components/profile/AttestationActionCluster";
import { AttestationRoster } from "@/components/profile/AttestationRoster";
import { ReputationSummaryPanel } from "@/components/profile/ReputationSummaryPanel";
import { ReviewCallout } from "@/components/review/ReviewCallout";
import type {
  AttestationTargetKind,
  Card,
  CardKind,
  OnchainSignals,
} from "@/lib/api/types";
import { isAllowed, unlockHint } from "@/lib/permissions";

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

      {/* ── §J.6 attestation roster — THE primary content of an
            entity card per the constitution. Sits above stats and
            stream because reputation is the headline, not the
            chronological activity stream. Phase 1 status: backend
            endpoint not yet shipped; roster renders empty-state
            copy per risk-assessment §2.9. ────────────────────────── */}
      <section className="mx-auto mt-12 max-w-[1560px] px-7">
        <div className="bcc-mono mb-4 flex items-center gap-3 text-cardstock-deep">
          <span className="inline-block h-px w-8 bg-cardstock-edge/50" />
          <span>Backing</span>
          <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
        </div>
        <AttestationRoster
          targetKind={cardKindToAttestationTargetKind(card.card_kind)}
          targetId={card.id}
          emptyState={{
            body: "No attestations on file yet. Be the first to vouch.",
          }}
        />
      </section>

      {/* ── Stats strip ─────────────────────────────────────────── */}
      <section className="mx-auto mt-12 max-w-[1560px] px-7">
        <StatsPanel card={card} />
      </section>

      {/* ── On-chain signals — validator-only block sourced from the
            chain LCD/RPC. Surfaces the operator's real-world data
            (uptime, commission, voting rank, stake, delegators) so a
            viewer can evaluate the validator regardless of whether
            anyone has claimed the page yet. Hidden when the card
            isn't a validator OR when the indexer hasn't produced a
            row for this entity. ───────────────────────────────────── */}
      {card.onchain_signals != null && (
        <section className="mx-auto mt-12 max-w-[1560px] px-7">
          <div className="bcc-mono mb-4 flex items-center gap-3 text-cardstock-deep">
            <span className="inline-block h-px w-8 bg-cardstock-edge/50" />
            <span>On-chain Signal</span>
            <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
          </div>
          <OnchainSignalsBlock signals={card.onchain_signals} />
        </section>
      )}

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

      {/* §J.6 reputation-first panel — replaces the legacy tier/rank/
          good-standing chip row + flags strip with the locked layout.
          Empty-state copy renders when the §4.20 attestation-layer
          fields haven't shipped from the backend yet; entity surface
          stays coherent during the Phase 1 rollout. */}
      <div className="mt-5">
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
      </div>

      {/* Social proof headline — server pre-renders the line. */}
      {card.social_proof?.headline !== undefined &&
        card.social_proof.headline !== null && (
          <p className="bcc-mono mt-5 text-sm text-cardstock-deep">
            {card.social_proof.headline}
          </p>
        )}

      {/* §J.6 trust-attestation action cluster — read-only scaffold.
          Cluster self-hides when no permission entries are shipped
          (Phase 1 backend rollout). Appears as backend lands the
          can_vouch / can_stand_behind / can_dispute / can_report
          gates in Phase 1 Week 2. Sits above the legacy callouts
          so visual primacy reads correctly during the migration
          window. */}
      <div className="mt-5">
        <AttestationActionCluster
          targetKind={cardKindToAttestationTargetKind(card.card_kind)}
          targetId={card.id}
          canVouch={card.permissions.can_vouch}
          canStandBehind={card.permissions.can_stand_behind}
          canDispute={card.permissions.can_dispute}
          canReport={card.permissions.can_report}
          viewerAttestation={card.viewer_attestation}
          viewerHasEndorsed={card.viewer_has_endorsed}
        />
      </div>

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
          Disabled with the server-supplied `unlock_hint` when the
          viewer hasn't unlocked reviews; the gate itself
          (Level + reputation tier thresholds) is server-resolved per
          the Phase γ rule that frontend never mirrors backend gates.
          When the viewer already has a review on file, the CTA flips
          to "REMOVE YOUR REVIEW" with a confirm gate. */}
      <ReviewCallout
        pageId={card.id}
        pageName={card.name}
        canReview={isAllowed(card.permissions, "can_review")}
        unlockHint={unlockHint(card.permissions, "can_review")}
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

// ─────────────────────────────────────────────────────────────────────
// OnchainSignalsBlock — table-shaped breakdown of the validator's
// on-chain data (status, uptime, commission, voting rank, stake,
// delegators, last refresh). The compact one-line summary lives on the
// card in /directory; this is the full surface for the profile page.
//
// Each cell self-hides when its value is null so a partially-enriched
// validator doesn't render "—%" placeholders that look like missing UI.
// The full block hides itself only when the parent gates on
// `card.onchain_signals != null` — at least the chain + status will
// always render past that gate.
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
