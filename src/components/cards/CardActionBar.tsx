"use client";

/**
 * CardActionBar — the two-pill action row along the bottom of the card's
 * front face.
 *
 * Slot rule: slot 1 is always the RELATIONSHIP (Watch); slot 2 is the
 * primary act that kind supports (Vouch for trust kinds, Join for
 * communities — communities have no trust system, so a swapped-in Vouch
 * would be meaningless there).
 *
 * Profile / Open / Review were removed from this bar. The card body is
 * itself the link now, so Open and Profile were duplicating it; Review
 * opens a composer and is not a peer action of Watch and Vouch.
 *
 * Layout is two `flex: 1` pills, deliberately NOT a breakpoint grid. The
 * previous `grid-cols-1 sm:grid-cols-3` stacked three 44px buttons into
 * 132px below 640px inside a fixed 440px `overflow: hidden` card, which
 * clipped the bottom of the card off on every phone.
 *
 * The active→undo affordance (filled pill turning to a red outline and
 * swapping its label) is pure CSS on .bcc-card-pill-on, so hover and
 * keyboard focus behave identically without any React hover state.
 *
 * Watch fallback (2026-07-23): like Review before it, the Watch button was
 * a SILENT NO-OP on every surface that didn't wire `onPull` — which was
 * every profile hero card. When no `onPull` is supplied the bar composes
 * the same primitives CardGrid uses: the shared `useWatching` query
 * (React Query dedupes it against the grids' identical key, and it
 * self-gates on session) resolves the true watching state + follow_id,
 * and the watch/unwatch mutations toggle it. Hosts that pass `onPull` are
 * untouched.
 */

import type { MouseEvent, ReactNode } from "react";
import { useMemo, useState } from "react";

import { WatchIcon, VouchIcon, JoinIcon } from "@/components/icons/registry";
import { useCastAttestation, useRevokeAttestation } from "@/hooks/useAttestations";
import { useWatchMutation, useUnwatchMutation } from "@/hooks/useWatch";
import { useWatching } from "@/hooks/useWatching";
import type {
  AttestationTargetKind,
  Card,
  CardCommunityDossier,
  CardKind,
} from "@/lib/api/types";
import { FOLLOW_COPY } from "@/lib/copy";
import { isAllowed, unlockHint } from "@/lib/permissions";

/**
 * Card kind → §J attestation target taxonomy.
 *
 * `member` maps to `user_profile`, and a member card's `id` IS the user
 * id (CardViewService emits `'id' => $userId` on that branch), so the
 * same field feeds both branches. `community` returns undefined — no
 * trust axis, and the server marks `can_vouch` not-applicable there.
 */
function vouchTargetKind(kind: CardKind): AttestationTargetKind | undefined {
  switch (kind) {
    case "member":    return "user_profile";
    case "validator": return "validator_card";
    case "project":   return "project_card";
    case "creator":   return "creator_card";
    default:          return undefined;
  }
}

/**
 * One pill. `onLabel`/`undoLabel` are both rendered; CSS decides which is
 * visible, so the undo wording appears on hover AND on keyboard focus.
 */
function ActionPill({
  color,
  active,
  disabled,
  title,
  icon,
  idleLabel,
  onLabel,
  undoLabel,
  ariaLabel,
  onClick,
}: {
  color: string;
  active: boolean;
  disabled: boolean;
  title: string;
  icon: ReactNode;
  idleLabel: string;
  onLabel: string;
  undoLabel: string;
  ariaLabel: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={(e: MouseEvent) => {
        // The card body is a link; an action must never navigate it.
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`bcc-card-pill${active ? " bcc-card-pill-on" : ""}`}
      style={{ ["--pill-color" as string]: color }}
    >
      {icon}
      {active ? (
        <>
          <span className="bcc-pill-on-label">{onLabel}</span>
          <span className="bcc-pill-undo">{undoLabel}</span>
        </>
      ) : (
        <span>{idleLabel}</span>
      )}
    </button>
  );
}

export function ActionBar({
  card,
  onPull,
  isPulled,
}: {
  card: Card;
  onPull?: ((card: Card) => void) | undefined;
  isPulled: boolean;
}) {
  // ── Watch ────────────────────────────────────────────────────────
  // Same follow-map semantics as CardGrid's buildFollowMap: a watching
  // row matches this card when kinds agree and (page_id ?? card_id)
  // equals card.id. The query self-gates on session, so anon viewers
  // never fire it (their button is server-disabled via can_watch).
  const watchFallbackActive = onPull === undefined;
  const watchingQuery = useWatching({ page_size: 50 });
  const watchMutation = useWatchMutation();
  const unwatchMutation = useUnwatchMutation();
  const fallbackEntry = useMemo(() => {
    if (!watchFallbackActive) return undefined;
    const items = watchingQuery.data?.items ?? [];
    const hit = items.find(
      (item) =>
        item.card_kind === card.card_kind &&
        (item.page_id !== null ? item.page_id : item.card_id) === card.id
    );
    return hit !== undefined
      ? { follow_id: hit.follow_id, source: hit.follow_source ?? "peepso" }
      : undefined;
  }, [watchFallbackActive, watchingQuery.data, card.card_kind, card.id]);
  const effectivePulled = watchFallbackActive ? fallbackEntry !== undefined : isPulled;

  const handleWatchClick = () => {
    if (onPull !== undefined) {
      onPull(card);
      return;
    }
    if (watchMutation.isPending || unwatchMutation.isPending) return;
    if (fallbackEntry !== undefined) {
      unwatchMutation.mutate({ follow_id: fallbackEntry.follow_id, source: fallbackEntry.source });
    } else {
      watchMutation.mutate({ target_kind: card.card_kind, target_id: card.id });
    }
  };

  // ── Vouch ────────────────────────────────────────────────────────
  // Server owns eligibility entirely (`can_vouch` + `viewer_attestation`);
  // nothing here recomputes it. A failed mutation surfaces through the
  // pill's own tooltip rather than an extra line of text — the card is a
  // fixed 440px and has no room to grow one.
  const [vouchError, setVouchError] = useState<string | null>(null);
  const castVouch = useCastAttestation({
    onSuccess: () => setVouchError(null),
    onError: () => setVouchError("Couldn't update your vouch. Try again."),
  });
  const revokeVouch = useRevokeAttestation({
    onSuccess: () => setVouchError(null),
    onError: () => setVouchError("Couldn't update your vouch. Try again."),
  });

  const targetKind = vouchTargetKind(card.card_kind);
  const existingVouch = card.viewer_attestation?.vouch ?? null;
  const hasVouched = existingVouch !== null;
  const vouchPending = castVouch.isPending || revokeVouch.isPending;
  const canVouch = isAllowed(card.permissions, "can_vouch");

  const handleVouchClick = () => {
    if (vouchPending || targetKind === undefined) return;
    setVouchError(null);
    if (existingVouch !== null) {
      revokeVouch.mutate(existingVouch.id);
      return;
    }
    castVouch.mutate({ kind: "vouch", target_kind: targetKind, target_id: card.id });
  };

  const watchAllowed = isAllowed(card.permissions, "can_watch");

  return (
    <div className="bcc-card-actions">
      <ActionPill
        color="var(--bcc-accent)"
        active={effectivePulled}
        disabled={!watchAllowed}
        title={
          watchAllowed
            ? effectivePulled
              ? FOLLOW_COPY.tooltipActive
              : FOLLOW_COPY.tooltipIdle
            : unlockHint(card.permissions, "can_watch") ??
              `${FOLLOW_COPY.cta} is unavailable for this card.`
        }
        icon={<WatchIcon size={14} strokeWidth={1.9} aria-hidden />}
        idleLabel="Watch"
        onLabel="Watching"
        undoLabel="Unwatch"
        ariaLabel={
          effectivePulled ? `Stop watching ${card.name}` : `Watch ${card.name}`
        }
        onClick={handleWatchClick}
      />

      {/* Vouch is absent on community cards entirely — the community bar
          below renders Join in this slot instead. */}
      {targetKind !== undefined && (
        <ActionPill
          color="var(--bcc-verified)"
          active={hasVouched}
          disabled={vouchPending || (!canVouch && !hasVouched)}
          title={
            vouchError ??
            (canVouch || hasVouched
              ? hasVouched
                ? `You vouch for ${card.name}. Click to withdraw.`
                : `Vouch for ${card.name} — back this operator.`
              : unlockHint(card.permissions, "can_vouch") ??
                "Vouching unlocks at neutral reputation.")
          }
          icon={<VouchIcon size={14} strokeWidth={1.9} aria-hidden />}
          idleLabel="Vouch"
          onLabel="Vouched"
          // "Unvouch" is not a word — you WITHDRAW support. The asymmetry
          // with "Unwatch" is deliberate: unwatching costs nothing, while
          // pulling a vouch shows up in someone else's history.
          undoLabel="Withdraw"
          ariaLabel={
            hasVouched
              ? `Withdraw your vouch for ${card.name}`
              : `Vouch for ${card.name}`
          }
          onClick={handleVouchClick}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// CommunityActionBar — JOIN only.
//
// Communities are the one kind with NO relationship slot: the server
// denies `can_watch` as `not_applicable` for them at every auth state
// ("communities are joined via the group detail's own join flow, never
// watched, so no `watch` action is emitted"), and `not_applicable` means
// HIDDEN, not dimmed — a permanently dead 38% pill would be teaching the
// viewer about an action that does not exist. They have no trust axis
// either, so there's no Vouch to put there.
//
// Join therefore takes the full width on its own.
// ─────────────────────────────────────────────────────────────────────

/**
 * JOIN-cell state machine. Branches ONLY on `card.community_dossier`
 * (§A2 — the server already resolved membership/gating; nothing here
 * recomputes eligibility):
 *
 *   viewer_is_member (or optimistic isJoined) → MEMBER ✓   (inert)
 *   nft, not a member                         → CHECK & JOIN (onJoin)
 *   trust-gated non-member                    → JOIN (enabled — the
 *                                               server adjudicates the
 *                                               threshold on the POST)
 *   local / open plain group                  → JOIN
 *   closed non-trust                          → PRIVATE   (disabled)
 *   secret                                    → INVITE-ONLY (disabled)
 *
 * The dimmed states are explained by the standing strip's T2 barrier row,
 * so the pill itself doesn't have to carry the reason.
 */
export function CommunityActionBar({
  card,
  dossier,
  onJoin,
  isJoined,
  joinPending,
}: {
  card: Card;
  dossier: CardCommunityDossier;
  onJoin?: ((card: Card) => void) | undefined;
  isJoined: boolean;
  joinPending: boolean;
}) {
  const isMember = dossier.viewer_is_member || isJoined;
  const isNft = dossier.type === "nft";
  const isPrivate =
    !isNft && dossier.trust_min === null && dossier.privacy === "closed";
  const isSecret = !isNft && dossier.privacy === "secret";

  let joinLabel: string;
  let joinTitle: string;
  let joinDisabled: boolean;
  if (isMember) {
    joinLabel = "Member";
    joinTitle = "You're a member — manage membership on the community page.";
    joinDisabled = false;
  } else if (isPrivate) {
    joinLabel = "Private";
    joinTitle = "Request to join on the community page.";
    joinDisabled = true;
  } else if (isSecret) {
    joinLabel = "Invite-only";
    joinTitle = "Members join by invitation.";
    joinDisabled = true;
  } else {
    // Always just "Join", including the NFT holder-gate path. "Check &
    // join" named a step the viewer never performs separately: the
    // ownership check IS the join request, and the server adjudicates it
    // either way. Splitting the two would be worse still — nobody would
    // choose "check" when "join" is sitting next to it. A viewer whose
    // wallet doesn't hold the collection gets the server's refusal, which
    // is the same information the label was trying to pre-empt.
    joinLabel = joinPending ? (isNft ? "Checking…" : "Joining…") : "Join";
    joinTitle = isNft
      ? "Verifies your linked wallet holds this collection, then joins."
      : "Join this community.";
    joinDisabled = joinPending;
  }

  return (
    <div className="bcc-card-actions">
      <ActionPill
        color="var(--bcc-verified)"
        active={isMember}
        disabled={joinDisabled}
        title={joinTitle}
        icon={<JoinIcon size={14} strokeWidth={1.9} aria-hidden />}
        idleLabel={joinLabel}
        onLabel="Member"
        // Leaving a community is a real decision made on the community
        // page, not a hover-to-undo on a directory card.
        undoLabel="Member"
        ariaLabel={isMember ? `You are a member of ${card.name}` : `Join ${card.name}`}
        onClick={() => {
          if (isMember || joinDisabled) return;
          if (onJoin !== undefined) onJoin(card);
        }}
      />
    </div>
  );
}
