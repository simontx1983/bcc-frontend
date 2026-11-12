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
 * Never-claimed validators (destination "queue"): no operator stands
 * behind the page, so slot 2 renders Message instead of Vouch — the
 * server parks the message for the first verified operator. Keyed on
 * `messaging.destination`, never `is_claimed` (isNeverClaimedValidator).
 * Claimed validators keep Watch + Vouch exactly as before: a Message
 * pill there would need the stacked second row, which takes ~42px of
 * portrait from every grid tile.
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

import type { Route } from "next";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useId, useMemo, useState } from "react";

import {
  WatchIcon,
  VouchIcon,
  JoinIcon,
  MessageIcon,
} from "@/components/icons/registry";
import { useCastAttestation, useRevokeAttestation } from "@/hooks/useAttestations";
import { useWatchMutation, useUnwatchMutation, watchErrorCopy } from "@/hooks/useWatch";
import { useWatching } from "@/hooks/useWatching";
import type {
  AttestationTargetKind,
  Card,
  CardCommunityDossier,
  CardKind,
} from "@/lib/api/types";
import { humanizeCode } from "@/lib/api/errors";
import { FOLLOW_COPY } from "@/lib/copy";
import { ATTESTATION_COPY } from "@/lib/copy/trust-layer";
import { useSignInLink } from "@/lib/auth/sign-in-link";
import { isAllowed, reasonCode, unlockHint } from "@/lib/permissions";
import {
  isNeverClaimedValidator,
  resolveValidatorMessageAction,
} from "@/lib/validators/messaging";

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
  locked = false,
  describedBy,
  title,
  icon,
  idleLabel,
  onLabel,
  undoLabel,
  ariaLabel,
  onClick,
  onLocked,
}: {
  color: string;
  active: boolean;
  disabled: boolean;
  /**
   * F-321: unavailable for a reason the viewer should be told. Stays
   * focusable (aria-disabled, not disabled) so a tap — there is no hover
   * on a phone — runs onLocked, which shows the reason under the pills.
   */
  locked?: boolean;
  describedBy?: string | undefined;
  title: string;
  icon: ReactNode;
  idleLabel: string;
  onLabel: string;
  undoLabel: string;
  ariaLabel: string;
  onClick: () => void;
  onLocked?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-disabled={locked || undefined}
      aria-describedby={describedBy}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={active}
      onClick={(e: MouseEvent) => {
        // The card body is a link; an action must never navigate it.
        e.preventDefault();
        e.stopPropagation();
        if (locked) {
          onLocked?.();
          return;
        }
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

/**
 * Message — a second, full-width action row, rendered ONLY when the host
 * surface hands down a live permission.
 *
 * The member card view-model deliberately does not carry one: CardViewService
 * returns `not_applicable` for `can_message` on member cards, with the note
 * that "members are messaged through the DM surface itself (the profile
 * view-model carries the live gate)". Rather than overturn that on a hot path
 * — every 50-card grid would need a policy evaluation per card — the one
 * surface that already holds the answer passes it in. /u/[handle] does;
 * grids, directories, search and watching lists do not, so their cards are
 * byte-identical to before.
 *
 * Navigation, not a toggle, so this is an anchor rather than an ActionPill
 * (which is a <button> with aria-pressed and undo-label swapping). Safe: the
 * card's body link is a SIBLING absolute <Link>, not a wrapper, and on the
 * profile the host passes `suppressBodyLink` so there is no body link at all.
 * No anchor ever nests inside another.
 */
/**
 * F-321: the one short line under a card's pills that says why a tapped
 * pill is unavailable, or why an action failed. The LATEST event wins: a
 * locked-pill tap replaces an earlier error and vice versa. An explanation
 * fades after a few seconds; a failure stays until the next event.
 */
type PillNotice = { text: string; tone: "status" | "alert"; at: number };

function usePillNotice() {
  const id = useId();
  const [notice, setNotice] = useState<PillNotice | null>(null);
  useEffect(() => {
    if (notice === null || notice.tone !== "status") return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  return {
    id,
    notice,
    show: (text: string, tone: "status" | "alert" = "status") =>
      setNotice({ text, tone, at: Date.now() }),
    clear: () => setNotice(null),
  };
}

function PillNoticeLine({ id, notice }: { id: string; notice: PillNotice }) {
  return (
    <p
      id={id}
      role={notice.tone}
      className="bcc-mono basis-full text-center text-[10px] leading-snug tracking-[0.06em] text-bcc-text-secondary"
    >
      {notice.text}
    </p>
  );
}

/**
 * Denial codes that mean "you're signed out". F-321: a signed-out viewer's
 * Watch / Vouch pill is a link to sign in (and back), not a dead control.
 * Page cards send `signin_required`; other surfaces use `auth_required`.
 */
const SIGN_IN_CODES: ReadonlySet<string> = new Set(["signin_required", "auth_required"]);

function SignInPill({
  color,
  icon,
  label,
  ariaLabel,
  href,
  onClick,
}: {
  color: string;
  icon: ReactNode;
  label: string;
  ariaLabel: string;
  href: Route;
  onClick: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      onClick={onClick}
      className="bcc-card-pill"
      style={{ ["--pill-color" as string]: color }}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}

/** Denial codes whose disabled pill + hint the viewer can act on. */
const VISIBLE_DENIAL_CODES: ReadonlySet<string> = new Set([
  "auth_required",
  "sender_chat_disabled",
]);

function MessagePill({
  permissions,
  recipientId,
  recipientName,
  onLocked,
}: {
  permissions: unknown;
  recipientId: number;
  recipientName: string;
  onLocked: (reason: string) => void;
}) {
  const allowed = isAllowed(permissions, "can_message");
  const hint = unlockHint(permissions, "can_message");
  const hintId = `card-message-hint-${recipientId}`;

  // A denial carrying a reason_code is read as a CLOSED list, like
  // MessageValidatorButton: only these codes render the disabled pill;
  // every other code (`unavailable` from F-99, `not_applicable`,
  // `messaging_unavailable`, anything new) is hidden even with a hint,
  // because a structural deny is never shown as a dead control.
  // The profile view-model does not forward reason_code today, so an
  // ABSENT code keeps the hint-based rule below rather than hiding
  // every disabled pill on /u/[handle].
  const code = reasonCode(permissions, "can_message");
  if (!allowed && code !== null && !VISIBLE_DENIAL_CODES.has(code)) {
    return null;
  }

  // Denied with no explanation to offer — say nothing rather than show a
  // dead control the operator cannot act on.
  if (!allowed && (hint === null || hint === "")) {
    return null;
  }

  if (!allowed) {
    // Narrowing doesn't carry across the two guards above; the early
    // return already proved this is a non-empty string.
    return <DisabledMessagePill hint={hint ?? ""} hintId={hintId} onLocked={onLocked} />;
  }

  return (
    <MessageLinkPill
      href={`/messages/new?to_user=${recipientId}`}
      ariaLabel={`Message ${recipientName}`}
    />
  );
}

/**
 * Validator Message — slot 2 on a never-claimed validator card, in place
 * of Vouch. The decision (label, href, disabled hint, or hidden) is the
 * same `resolveValidatorMessageAction` that MessageValidatorButton renders
 * on the entity profile; only the visual register differs.
 *
 * The visible label stays "Message": "MESSAGE VALIDATOR" at the pill's
 * 10.5px / 0.14em tracking does not fit a half-width pill in the 316px
 * card. The full label ("Message Validator" / "Message Operator") is the
 * accessible name and the tooltip.
 *
 * The `unavailable` shield renders nothing here: the profile's one-line
 * notice has no room on a fixed-height card, and nothing is still
 * identity-free.
 */
function ValidatorMessagePill({
  card,
  onLocked,
}: {
  card: Card;
  onLocked: (reason: string) => void;
}) {
  const action = resolveValidatorMessageAction({
    pageId: card.id,
    permissions: card.permissions,
    messaging: card.messaging,
  });

  if (action.kind === "disabled") {
    return (
      <DisabledMessagePill
        hint={action.hint}
        hintId={`card-validator-message-hint-${card.id}`}
        ariaLabel={action.label}
        onLocked={onLocked}
      />
    );
  }
  if (action.kind === "link") {
    return (
      <MessageLinkPill
        href={action.href}
        ariaLabel={`${action.label}: ${card.name}`}
        title={action.label}
      />
    );
  }
  return null;
}

function MessageLinkPill({
  href,
  ariaLabel,
  title,
}: {
  href: string;
  ariaLabel: string;
  title?: string | undefined;
}) {
  return (
    <Link
      href={href as Route}
      aria-label={ariaLabel}
      title={title}
      // The card body is a link on grid surfaces; an action must never
      // navigate it. Harmless where suppressBodyLink is set.
      onClick={(e: MouseEvent) => e.stopPropagation()}
      className="bcc-card-pill bcc-card-pill-message"
      style={{ ["--pill-color" as string]: "var(--bcc-accent)" }}
    >
      <MessageIcon size={14} strokeWidth={1.9} aria-hidden />
      <span>Message</span>
    </Link>
  );
}

function DisabledMessagePill({
  hint,
  hintId,
  ariaLabel,
  onLocked,
}: {
  hint: string;
  hintId: string;
  ariaLabel?: string | undefined;
  /** F-321: a tap shows the reason under the pills (no hover on a phone). */
  onLocked: (reason: string) => void;
}) {
  return (
    <>
      <button
        type="button"
        // aria-disabled, NOT the disabled attribute: a disabled button is
        // skipped by the tab order, which would make the explanation below
        // unreachable by keyboard. This stays focusable and announced.
        aria-disabled="true"
        aria-describedby={hintId}
        aria-label={ariaLabel}
        title={hint}
        onClick={(e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          onLocked(hint);
        }}
        className="bcc-card-pill bcc-card-pill-message"
        style={{ ["--pill-color" as string]: "var(--bcc-accent)" }}
      >
        <MessageIcon size={14} strokeWidth={1.9} aria-hidden />
        <span>Message</span>
      </button>
      <span id={hintId} className="sr-only">
        {hint}
      </span>
    </>
  );
}

export function ActionBar({
  card,
  onPull,
  isPulled,
  messagePermissions,
}: {
  card: Card;
  onPull?: ((card: Card) => void) | undefined;
  isPulled: boolean;
  /**
   * The member profile's `permissions` block, passed only by /u/[handle].
   * `unknown` deliberately — read through isAllowed/unlockHint, which are
   * the defensive accessors the doctrine requires. Absent everywhere else,
   * which is what keeps grid cards unchanged.
   */
  messagePermissions?: unknown;
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
  // F-236: a refused or failed watch surfaces through the pill's tooltip,
  // the same place a failed vouch does: the card is a fixed 440px with no
  // room for a line. Keyed on the error code, never err.message.
  const [watchError, setWatchError] = useState<string | null>(null);
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
    setWatchError(null);
    if (fallbackEntry !== undefined) {
      unwatchMutation.mutate(
        { follow_id: fallbackEntry.follow_id, source: fallbackEntry.source },
        { onError: (err) => setWatchError(watchErrorCopy(err, "unwatch")) },
      );
    } else {
      watchMutation.mutate(
        { target_kind: card.card_kind, target_id: card.id },
        { onError: (err) => setWatchError(watchErrorCopy(err, "watch")) },
      );
    }
  };

  // ── Vouch ────────────────────────────────────────────────────────
  // Server owns eligibility entirely (`can_vouch` + `viewer_attestation`);
  // nothing here recomputes it. A failed mutation surfaces through the
  // pill's own tooltip rather than an extra line of text — the card is a
  // fixed 440px and has no room to grow one.
  //
  // Local success state: the `card` prop is a SNAPSHOT — React Query
  // page data on the grids, plain RSC props on the profile hero and the
  // /communities-style server grids. Invalidation (useAttestations)
  // refetches the query-backed surfaces eventually, but nothing can
  // refresh an RSC-supplied card, and even a grid refetch lands a beat
  // after the click. So the pill's pressed state flips locally the
  // moment the mutation SUCCEEDS (not optimistically on click — the
  // server still adjudicates), and the id captured from the response
  // keeps withdraw working before any refetch arrives. Server truth
  // wins again on the next fetched card.
  const targetKind = vouchTargetKind(card.card_kind);
  const [vouchError, setVouchError] = useState<string | null>(null);
  const [localVouch, setLocalVouch] = useState<
    { active: true; id: number } | { active: false } | null
  >(null);
  const castVouch = useCastAttestation({
    onSuccess: (data) => {
      setVouchError(null);
      // status 'existing' returns the pre-existing row — same end state.
      setLocalVouch({ active: true, id: data.id });
    },
    onError: (err) => setVouchError(humanizeCardCastError(err, targetKind)),
  });
  const revokeVouch = useRevokeAttestation({
    onSuccess: () => {
      setVouchError(null);
      setLocalVouch({ active: false });
    },
    onError: () => setVouchError("Couldn't update your vouch. Try again."),
  });

  const serverVouch = card.viewer_attestation?.vouch ?? null;
  // Local mutation result beats the card snapshot; the snapshot beats
  // nothing. A refetched card that already agrees makes the override a
  // no-op.
  const hasVouched =
    localVouch !== null ? localVouch.active : serverVouch !== null;
  const activeVouchId =
    localVouch !== null
      ? localVouch.active
        ? localVouch.id
        : null
      : (serverVouch?.id ?? null);
  const vouchPending = castVouch.isPending || revokeVouch.isPending;
  const canVouch = isAllowed(card.permissions, "can_vouch");

  const handleVouchClick = () => {
    if (vouchPending || targetKind === undefined) return;
    setVouchError(null);
    if (activeVouchId !== null) {
      revokeVouch.mutate(activeVouchId);
      return;
    }
    castVouch.mutate({ kind: "vouch", target_kind: targetKind, target_id: card.id });
  };

  const watchAllowed = isAllowed(card.permissions, "can_watch");

  // ── Why a pill is unavailable (F-321) ─────────────────────────────
  // A title tooltip never shows on a phone, so a tapped locked pill did
  // nothing and said nothing. Signed out, the pill is a sign-in link
  // instead. Locked for another reason, a tap shows the reason in a short
  // line under the pills for a few seconds; a failed watch or vouch shows
  // there too (it used to live in the tooltip only, F-236).
  const signIn = useSignInLink();
  const watchNeedsSignIn =
    !watchAllowed && SIGN_IN_CODES.has(reasonCode(card.permissions, "can_watch") ?? "");
  const vouchNeedsSignIn =
    !canVouch && !hasVouched && SIGN_IN_CODES.has(reasonCode(card.permissions, "can_vouch") ?? "");
  const watchLockedReason =
    unlockHint(card.permissions, "can_watch") ?? `${FOLLOW_COPY.cta} is unavailable for this card.`;
  // No frontend-written eligibility rule (§A2): the server's hint, or a
  // neutral line.
  const vouchLockedReason = unlockHint(card.permissions, "can_vouch") ?? "Not available yet.";

  const pillNotice = usePillNotice();
  const { show: showNotice } = pillNotice;
  // A failure is the latest event when it happens: it replaces whatever
  // the line was saying.
  useEffect(() => {
    if (watchError !== null) showNotice(watchError, "alert");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on a new error only
  }, [watchError]);
  useEffect(() => {
    if (vouchError !== null) showNotice(vouchError, "alert");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on a new error only
  }, [vouchError]);
  /** A locked pill was tapped: its reason replaces any earlier failure. */
  const explain = (reason: string) => {
    setWatchError(null);
    setVouchError(null);
    showNotice(reason);
  };
  const shownNotice = pillNotice.notice;

  // A member card's `id` IS the user id (CardViewService emits
  // 'id' => $userId on that branch), so the recipient needs no extra lookup.
  const showMessage =
    messagePermissions !== undefined && card.card_kind === "member";

  // Never-claimed validator: Message takes the Vouch slot. Back and
  // Report never render on the card row; EntityProfile applies the same
  // predicate to AttestationActionCluster.
  const neverClaimedValidator = isNeverClaimedValidator(card);

  return (
    <div
      className={
        showMessage || shownNotice !== null
          ? "bcc-card-actions bcc-card-actions-stacked"
          : "bcc-card-actions"
      }
    >
      {watchNeedsSignIn ? (
        <SignInPill
          color="var(--bcc-accent)"
          icon={<WatchIcon size={14} strokeWidth={1.9} aria-hidden />}
          label="Watch"
          ariaLabel={`Sign in to watch ${card.name}`}
          href={signIn.href}
          onClick={signIn.onClick}
        />
      ) : (
      <ActionPill
        color="var(--bcc-accent)"
        active={effectivePulled}
        disabled={false}
        locked={!watchAllowed}
        describedBy={shownNotice !== null ? pillNotice.id : undefined}
        onLocked={() => explain(watchLockedReason)}
        title={
          watchError ??
          (watchAllowed
            ? effectivePulled
              ? FOLLOW_COPY.tooltipActive
              : FOLLOW_COPY.tooltipIdle
            : unlockHint(card.permissions, "can_watch") ??
              `${FOLLOW_COPY.cta} is unavailable for this card.`)
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
      )}

      {/* Vouch is absent on community cards entirely — the community bar
          below renders Join in this slot instead. */}
      {neverClaimedValidator && <ValidatorMessagePill card={card} onLocked={explain} />}

      {targetKind !== undefined && !neverClaimedValidator && vouchNeedsSignIn && (
        <SignInPill
          color="var(--bcc-verified)"
          icon={<VouchIcon size={14} strokeWidth={1.9} aria-hidden />}
          label="Vouch"
          ariaLabel={`Sign in to vouch for ${card.name}`}
          href={signIn.href}
          onClick={signIn.onClick}
        />
      )}

      {targetKind !== undefined && !neverClaimedValidator && !vouchNeedsSignIn && (
        <ActionPill
          color="var(--bcc-verified)"
          active={hasVouched}
          disabled={vouchPending}
          locked={!canVouch && !hasVouched}
          describedBy={shownNotice !== null ? pillNotice.id : undefined}
          onLocked={() => explain(vouchLockedReason)}
          title={
            vouchError ??
            (canVouch || hasVouched
              ? hasVouched
                ? `You vouch for ${card.name}. Click to withdraw.`
                : `Vouch for ${card.name} — back this operator.`
              : vouchLockedReason)
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

      {/* F-321: the reason a tapped pill is unavailable, or why an action
          failed — readable on touch. Sits under the pills; the portrait
          (flex: 1) absorbs the height, as for the Message row below. */}
      {shownNotice !== null && <PillNoticeLine id={pillNotice.id} notice={shownNotice} />}

      {/* Second row. NOT a third pill across: CardActionBar's own history
          records that a three-across layout stacked to 132px under 640px
          inside a fixed 440px overflow:hidden card and cut the card's bottom
          off on every phone. The portrait (flex:1) absorbs this row's height
          instead. */}
      {showMessage && (
        <MessagePill
          permissions={messagePermissions}
          recipientId={card.id}
          recipientName={card.name}
          onLocked={explain}
        />
      )}
    </div>
  );
}

/**
 * Card vouch-cast failure copy. Generic by default (the pill tooltip has
 * no room for detail), except `bcc_not_found` on a PAGE target, which the
 * server returns when the page has no claimed operator to attest to.
 * Member targets keep the generic line.
 */
function humanizeCardCastError(
  err: unknown,
  targetKind: AttestationTargetKind | undefined,
): string {
  const generic = "Couldn't update your vouch. Try again.";
  if (targetKind === undefined || targetKind === "user_profile") {
    return generic;
  }
  return humanizeCode(err, { bcc_not_found: ATTESTATION_COPY.unclaimed_page_target }, generic);
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
  // Delegator communities are STORED closed, but there is no request
  // queue behind that: the gate is the delegation the join verifies. Read
  // as plain privacy they would dim to a dead "Private" pill.
  const isVerifiedJoin = isNft || dossier.type === "validator";
  const isPrivate =
    !isVerifiedJoin && dossier.trust_min === null && dossier.privacy === "closed";
  const isSecret = !isVerifiedJoin && dossier.privacy === "secret";

  let joinLabel: string;
  let joinTitle: string;
  let joinDisabled: boolean;
  if (isMember) {
    joinLabel = "Member";
    joinTitle = "You're a member — manage membership on the community page.";
    joinDisabled = false;
  } else if (isPrivate) {
    joinLabel = "Private";
    // Truthful: there is no request flow (UX scan M-gr5).
    joinTitle = "This community is private.";
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
    joinLabel = joinPending ? (isVerifiedJoin ? "Checking…" : "Joining…") : "Join";
    joinTitle = isNft
      ? "Verifies your linked wallet holds this collection, then joins."
      : isVerifiedJoin
        ? "Verifies your linked wallet delegates enough to this validator, then joins."
        : "Join this community.";
    joinDisabled = joinPending;
  }

  // F-321: Private / Invite-only explain themselves on tap (a title never
  // shows on a phone); a pending join stays a real disabled control.
  const locked = !isMember && (isPrivate || isSecret);
  const pillNotice = usePillNotice();

  return (
    <div
      className={
        pillNotice.notice !== null ? "bcc-card-actions bcc-card-actions-stacked" : "bcc-card-actions"
      }
    >
      <ActionPill
        color="var(--bcc-verified)"
        active={isMember}
        disabled={joinDisabled && !locked}
        locked={locked}
        describedBy={pillNotice.notice !== null ? pillNotice.id : undefined}
        onLocked={() => pillNotice.show(joinTitle)}
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
      {pillNotice.notice !== null && <PillNoticeLine id={pillNotice.id} notice={pillNotice.notice} />}
    </div>
  );
}
