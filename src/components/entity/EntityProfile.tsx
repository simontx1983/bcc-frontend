/**
 * EntityProfile — the validator / project / creator page, on the ONE shared
 * detail layout (Site Structure A §12, hero option B, Phillip 2026-11-25):
 *
 *   Announcements   validator pages: the bar, and the operator's button
 *   FileRail        FLOOR // {KIND} · @handle … FILE NNNN // OPEN
 *   DetailHeader    crest avatar · the card's kind word · name · @handle ·
 *                   chips (chain, UNCLAIMED) · Watch · Vouch · Message ·
 *                   Share · the card's counts
 *   ClaimCallout    unclaimed pages only, full width above the tabs, so a
 *                   claimer finds it on a phone without scrolling the feed
 *   DetailBody      EntityTabs beside the side column:
 *                     Standing (the trust panel) · About · Facts ·
 *                     the page's own blocks (`side`, e.g. a validator's
 *                     team) · Act on this page (endorse, dispute)
 *
 * The trading card is not in the header (option B); it stays on every list.
 * Delegators and the creator's Gallery are tabs. Tab order and the default
 * tab are D4's (one tab component); D2 moves placement only.
 *
 * Server component: what it shares with the card face comes from the
 * hook-free card-face-stats module, never from a card component.
 */

import type { ReactNode } from "react";

import { cardFaceStats, cardHeaderWord, chainSlug } from "@/components/cards/card-face-stats";
import { ShareButton } from "@/components/common/ShareButton";
import { ChainTabs } from "@/components/entity/ChainTabs";
import { ClaimCallout } from "@/components/claim/ClaimCallout";
import { DetailBody, DETAIL_CONTAINER, DetailHeader, DetailPage, SideBlock } from "@/components/detail/DetailLayout";
import { DisputeCallout } from "@/components/disputes/DisputeCallout";
import { EndorseButton } from "@/components/endorse/EndorseButton";
import { AnnouncementsPanel } from "@/components/announcements/AnnouncementsPanel";
import { AnnouncementsTopSection } from "@/components/announcements/AnnouncementsTopSection";
import { delegatorGroupHasContent } from "@/components/entity/delegator-group-visibility";
import { EntityTabs } from "@/components/entity/EntityTabs";
import { EntityWatchButton } from "@/components/entity/EntityWatchButton";
import { CardReviewsPanel } from "@/components/entity/panels/CardReviewsPanel";
import { CardWatchersPanel } from "@/components/entity/panels/CardWatchersPanel";
import { DelegatorGroupPanel } from "@/components/entity/panels/DelegatorGroupPanel";
import { PageStreamPanel } from "@/components/entity/panels/PageStreamPanel";
import { LockedStreamPanel } from "@/components/entity/LockedStreamPanel";
import { Avatar } from "@/components/identity/Avatar";
import { FileRail } from "@/components/layout/FileRail";
import { MessageValidatorButton } from "@/components/messages/MessageValidatorButton";
import { AttestationActionCluster } from "@/components/profile/AttestationActionCluster";
import { AttestationRoster } from "@/components/profile/AttestationRoster";
import { ReputationSummaryPanel } from "@/components/profile/ReputationSummaryPanel";
import { ReviewCallout } from "@/components/review/ReviewCallout";
import type { RosterSeed } from "@/hooks/useAttestationRoster";
import type {
  AttestationTargetKind,
  Card,
  CardKind,
  EntityCardKind,
  OnchainSignals,
} from "@/lib/api/types";
import { communityChainLabel } from "@/lib/communities/chain-catalog";
import { isAllowed, unlockHint } from "@/lib/permissions";
import { ATTESTATION_COPY } from "@/lib/copy/trust-layer";
import { isNeverClaimedValidator } from "@/lib/validators/messaging";

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

/** The card family's colour per kind (CardFactory's KIND_TO_COLOR_VAR). */
const KIND_COLOR: Partial<Record<CardKind, string>> = {
  validator: "var(--kind-validator)",
  project: "var(--kind-project)",
  creator: "var(--kind-creator)",
};

/** A URL the server actually sent (null, undefined and "" all mean none). */
function presentUrl(url: string | null | undefined): string | null {
  return url !== null && url !== undefined && url.trim() !== "" ? url : null;
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
   * claimed-but-quiet. Per kind the messaging is slightly different.
   * The page IS claimed whenever this shows, so the copy must never
   * talk about the operator claiming it. Used only when card.is_claimed.
   */
  streamEmptyState: { title: string; body: string };
  /**
   * Whether the current viewer has a session. Drives the §N7 visible-
   * but-disabled state on the §N8 Claim CTA — server component reads
   * the session and passes a bool across the RSC boundary.
   */
  viewerAuthed: boolean;
  /**
   * Anonymous server-rendered first page of the attestation roster, seeded
   * into React Query so the Backing tab — the landing tab — renders real
   * rows instead of its empty state during the client round-trip.
   *
   * ANONYMOUS VIEWERS ONLY. The read is token-less so the 60s Data-Cache
   * entry is shared, and the route hands it only to viewers who are
   * themselves anonymous, so no one is served a cache-shared payload in
   * place of their own. Authed viewers keep the client fetch. Omitted
   * entirely → the roster behaves exactly as it did before.
   */
  rosterSeed?: RosterSeed | undefined;
  /** Creator pages: the Gallery tab's content (the route renders it). */
  galleryPanel?: ReactNode;
  /** Extra side-column blocks for this page (e.g. a validator's team). */
  side?: ReactNode;
}

export function EntityProfile({
  card,
  kindLabel,
  streamEmptyState,
  viewerAuthed,
  rosterSeed,
  galleryPanel,
  side,
}: EntityProfileProps) {
  const targetKind     = cardKindToAttestationTargetKind(card.card_kind);
  const entityCardKind = cardKindToEntityCardKind(card.card_kind);
  const neverClaimed   = isNeverClaimedValidator(card);
  const chain          = chainName(card);
  const bio            = card.bio.trim();
  const facts          = entityFacts(card);
  const showClaim      = card.is_claimed === false && card.claim_target !== null;

  return (
    <DetailPage>
      {/* ── Announcements — the very top of the page, above everything
          else in it. Gated on the same capability block as the tab: absent
          → renders nothing and fetches nothing. */}
      {card.announcements != null && (
        <AnnouncementsTopSection
          pageId={card.id}
          capabilities={card.announcements.capabilities}
          hasAny={card.announcements.has_any ?? false}
        />
      )}

      {/* Status reads "OPEN" for claimed entities, "UNCLAIMED" for
          unclaimed ones — the same word the card ribbon and ClaimCallout use. */}
      <FileRail
        kind={kindLabel}
        subject={card.handle !== "" ? `@${card.handle.toUpperCase()}` : ""}
        fileNumber={String(card.id).padStart(4, "0")}
        status={card.is_claimed === false ? "UNCLAIMED" : "OPEN"}
      />

      <DetailHeader
        avatar={
          <Avatar
            avatarUrl={presentUrl(card.crest.image_url)}
            handle={card.handle !== "" ? card.handle : String(card.id)}
            displayName={card.name}
            size="lg"
          />
        }
        kind={cardHeaderWord(card)}
        kindColor={KIND_COLOR[card.card_kind] ?? "var(--bcc-text-secondary)"}
        name={card.name}
        handle={card.handle}
        chips={
          chain !== null || card.is_claimed === false ? (
            <>
              {chain !== null && <Chip>{chain}</Chip>}
              {card.is_claimed === false && <Chip>Unclaimed</Chip>}
            </>
          ) : undefined
        }
        actions={
          <>
            <EntityWatchButton card={card} />
            {/* Never-claimed validator (messaging.destination "queue", NOT
                is_claimed): no operator behind the page, so Vouch, Back and
                Report are not offered. Watch and Message stay. */}
            {!neverClaimed && (
              <AttestationActionCluster
                targetKind={targetKind}
                targetId={card.id}
                canVouch={card.permissions.can_vouch}
                canStandBehind={card.permissions.can_stand_behind}
                canReport={card.permissions.can_report}
                viewerAttestation={card.viewer_attestation}
                viewerHasEndorsed={card.viewer_has_endorsed}
              />
            )}
            {/* Validator pages only. Visibility past this kind check is the
                server's call (messaging.destination + can_message); never
                card.is_claimed. */}
            {card.card_kind === "validator" && (
              <MessageValidatorButton
                pageId={card.id}
                permissions={card.permissions}
                messaging={card.messaging}
              />
            )}
          </>
        }
        // Entity pages are PUBLIC: Share for every viewer, on the server's
        // own route (`card.links.self`, §A2).
        share={<ShareButton path={card.links.self} title={card.name} ariaLabel={`Share ${card.name}`} />}
        stats={cardFaceStats(card)}
      />

      {showClaim && card.claim_target !== null && (
        <div className={`${DETAIL_CONTAINER} mt-6`}>
          <ClaimCallout
            pageId={card.id}
            pageName={card.name}
            target={card.claim_target}
            viewerAuthed={viewerAuthed}
            canClaim={card.permissions.can_claim}
          />
        </div>
      )}

      <DetailBody
        main={
          <EntityTabs
            backingPanel={
              <AttestationRoster
                targetKind={targetKind}
                targetId={card.id}
                emptyState={{
                  // A never-claimed validator can't be vouched for, so the
                  // empty state must not invite it.
                  body: neverClaimed
                    ? ATTESTATION_COPY.unclaimed_validator_backing_empty
                    : "No attestations on file yet. Be the first to vouch.",
                }}
                seed={rosterSeed}
              />
            }
            reviewsPanel={
              entityCardKind !== null ? (
                <div className="flex flex-col gap-6">
                  <ReviewCallout
                    target={{ kind: "entity", pageId: card.id }}
                    pageName={card.name}
                    canReview={isAllowed(card.permissions, "can_review")}
                    unlockHint={unlockHint(card.permissions, "can_review")}
                    hasReviewed={card.viewer_has_reviewed}
                    viewerAuthed={viewerAuthed}
                  />
                  <CardReviewsPanel kind={entityCardKind} cardId={card.id} cardName={card.name} />
                </div>
              ) : null
            }
            /* §4.32 — the capability block IS the gate. Absent → null → the
               tab does not render and nothing fetches. */
            announcementsPanel={
              card.announcements != null ? (
                <AnnouncementsPanel
                  pageId={card.id}
                  validatorName={card.name}
                  capabilities={card.announcements.capabilities}
                />
              ) : null
            }
            /* `page_stream` is the gate for reading the page feed: validator
               pages only, and absent on a backend without the route. */
            activityPanel={
              card.page_stream != null ? (
                <PageStreamPanel
                  pageId={card.id}
                  pageName={card.name}
                  canPost={card.page_stream.can_post}
                  unclaimed={card.is_claimed === false}
                  emptyState={streamEmptyState}
                />
              ) : card.is_claimed === false ? (
                <LockedStreamPanel pageName={card.name} />
              ) : (
                <div className="bcc-panel mx-auto max-w-2xl p-8 text-center">
                  <h2 className="bcc-stencil text-2xl text-bcc-text">
                    {streamEmptyState.title}
                  </h2>
                  <p className="mt-2 font-serif text-bcc-text-secondary">
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
            // Validator pages: the delegator group, a tab now (it sat above
            // the tabs). Only when the block has something to show.
            delegatorsPanel={
              card.delegator_group != null && delegatorGroupHasContent(card.delegator_group) ? (
                <DelegatorGroupPanel pageId={card.id} pageName={card.name} block={card.delegator_group} />
              ) : null
            }
            onchainPanel={
              card.onchain_signals !== null && card.onchain_signals !== undefined
                ? <OnchainSignalsBlock signals={card.onchain_signals} />
                : null
            }
            galleryPanel={galleryPanel ?? null}
            chainsPanel={
              card.chains !== null ? <ChainTabs chains={card.chains} /> : null
            }
          />
        }
        side={
          <>
            <SideBlock title="Standing">
              {/* §J.6 reputation-first panel — same component /u/[handle]
                  uses, sourced from card data. */}
              <ReputationSummaryPanel
                reputationScore={card.reputation_score ?? card.trust_score}
                reliabilityStanding={card.reliability_standing}
                reputationTier={card.reputation_tier}
                tierLabel={card.reputation_tier_label ?? "Neutral"}
                rankLabel={card.rank_label ?? ""}
                isInGoodStanding={card.is_in_good_standing}
                flags={card.flags}
                divergenceState={card.negative_signals?.divergence_state}
                underReview={card.negative_signals?.under_review}
                reputationVolatile={card.negative_signals?.volatile}
                unresolvedClaimsCount={card.negative_signals?.unresolved_claims_count}
              />
              {/* Social proof headline — server pre-renders the line. */}
              {card.social_proof?.headline != null && card.social_proof.headline !== "" && (
                <p className="bcc-mono mt-3 text-sm text-bcc-text-secondary">
                  {card.social_proof.headline}
                </p>
              )}
            </SideBlock>
            {bio !== "" && (
              <SideBlock title="About">
                <p className="line-clamp-6 text-[15px] leading-relaxed text-bcc-text-secondary">{bio}</p>
              </SideBlock>
            )}
            {facts.length > 0 && (
              <SideBlock title="Facts">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[14px]">
                  {facts.map((fact) => (
                    <div key={fact.label} className="contents">
                      <dt className="text-bcc-text-secondary">{fact.label}</dt>
                      <dd>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              </SideBlock>
            )}
            {side}
            <SideBlock title="Act on this page">
              <div className="flex flex-col gap-3">
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
                  // can_open_dispute is the owner-only vote-dispute gate —
                  // the sole dispute entry point.
                  canDispute={isAllowed(card.permissions, "can_open_dispute")}
                />
              </div>
            </SideBlock>
          </>
        }
      />
    </DetailPage>
  );
}

/** The card's chain by name ("Cosmos Hub"), the slug when the catalog has none. */
function chainName(card: Card): string | null {
  const slug = chainSlug(card);
  return slug !== null ? (communityChainLabel(slug) ?? slug) : null;
}

/** A plain fact chip in the header (no dot: a dot means trust). */
function Chip({ children }: { children: ReactNode }) {
  return (
    <span
      className="bcc-mono rounded-full border px-2.5 py-1"
      style={{
        fontSize: "10px",
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        borderColor: "var(--bcc-border-strong)",
        color: "var(--bcc-text-secondary)",
      }}
    >
      {children}
    </span>
  );
}

/**
 * The Facts block: the chain, and a validator's status, commission, voting
 * rank and delegator count, formatted exactly as the On-chain tab formats
 * them (onchainCells). Never stake amounts or dates.
 */
const FACT_CELL_KEYS = new Set(["status", "commission", "rank", "delegators"]);

function entityFacts(card: Card): Array<{ label: string; value: string }> {
  const facts: Array<{ label: string; value: string }> = [];
  const chain = chainName(card);
  if (chain !== null) facts.push({ label: "Chain", value: chain });
  if (card.onchain_signals != null) {
    for (const cell of onchainCells(card.onchain_signals)) {
      if (FACT_CELL_KEYS.has(cell.key)) facts.push({ label: cell.label, value: cell.value });
    }
  }
  return facts;
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

/** Every on-chain cell, keyed, in display order. The On-chain tab shows them all; Facts picks a few. */
function onchainCells(signals: OnchainSignals): Array<{ key: string; label: string; value: string }> {
  const cells: Array<{ key: string; label: string; value: string }> = [];

  cells.push({ key: "status", label: "Status", value: formatStatus(signals.status) });

  if (signals.uptime_30d !== null) {
    cells.push({
      key: "uptime", label: "Uptime · 30d",
      value: `${(signals.uptime_30d * 100).toFixed(2)}%`,
    });
  }
  if (signals.commission_rate !== null) {
    cells.push({
      key: "commission", label: "Commission",
      value: `${(signals.commission_rate * 100).toFixed(2)}%`,
    });
  }
  if (signals.voting_power_rank !== null) {
    cells.push({
      key: "rank", label: "Voting Rank",
      value: `#${signals.voting_power_rank}`,
    });
  }
  if (signals.total_stake !== null) {
    cells.push({
      key: "total_stake", label: "Total Stake",
      value: formatStake(signals.total_stake),
    });
  }
  if (signals.self_stake !== null) {
    cells.push({
      key: "self_stake", label: "Self Stake",
      value: formatStake(signals.self_stake),
    });
  }
  if (signals.delegator_count !== null) {
    cells.push({
      key: "delegators", label: "Delegators",
      value: signals.delegator_count.toLocaleString(),
    });
  }
  if (signals.jailed_count !== null && signals.jailed_count > 0) {
    cells.push({
      key: "jailed", label: "Jailed Events",
      value: signals.jailed_count.toLocaleString(),
    });
  }
  return cells;
}

function OnchainSignalsBlock({ signals }: { signals: OnchainSignals }) {
  const cells = onchainCells(signals);

  return (
    <>
      <div
        className="bcc-panel grid gap-px overflow-hidden"
        style={{
          gridTemplateColumns: `repeat(${Math.min(cells.length, 4)}, minmax(0,1fr))`,
          background: "rgb(var(--ink-rgb) / 0.08)",
        }}
      >
        {cells.map((cell) => (
          <div
            key={cell.key}
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
        <p className="bcc-mono mt-3 text-[10px] tracking-[0.18em] text-bcc-text-secondary">
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
