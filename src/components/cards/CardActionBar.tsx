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
 * Watch fallback: when no `onPull` is supplied (the profile hero), the bar
 * owns the watch itself through `useViewerWatch`, reading the card's own
 * `viewer_is_watching` / `viewer_watch` (F-255) — never a page of
 * /me/watching. Hosts that pass `onPull` own the state themselves.
 */

import type { Route } from "next";
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

import {
  WatchIcon,
  VouchIcon,
  JoinIcon,
  MessageIcon,
} from "@/components/icons/registry";
import { useCastAttestation, useRevokeAttestation } from "@/hooks/useAttestations";
import { useViewerWatch, WATCH_UNKNOWN_COPY } from "@/hooks/useViewerWatch";
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
import { SIGN_IN_REASON_CODES, isAllowed, reasonCode, unlockHint } from "@/lib/permissions";
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
 *
 * #276 follow-ups:
 *  - Each notice records which pill raised it (`source`), and only THAT
 *    pill is described by the line. Before, a Vouch failure also became
 *    Watch's description, and a screen reader read it on the wrong pill.
 *  - Every event gets a new `seq`; its text is a fresh `<span key={seq}>`
 *    inside a region that stays mounted (PillNoticeLine), so the same
 *    failure twice in a row is announced again. Before, identical text
 *    never re-announced.
 */
type PillNoticeSource = "watch" | "vouch" | "message" | "join";
type PillNotice = {
  text: string;
  tone: "status" | "alert";
  source: PillNoticeSource;
  seq: number;
};

function usePillNotice() {
  const id = useId();
  const [notice, setNotice] = useState<PillNotice | null>(null);
  const seq = useRef(0);
  useEffect(() => {
    if (notice === null || notice.tone !== "status") return;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);
  return {
    id,
    notice,
    show: (text: string, source: PillNoticeSource, tone: "status" | "alert" = "status") => {
      seq.current += 1;
      setNotice({ text, tone, source, seq: seq.current });
    },
    /** The line's id for the pill that raised the notice; undefined for any other. */
    describes: (source: PillNoticeSource): string | undefined =>
      notice !== null && notice.source === source ? id : undefined,
    clear: () => setNotice(null),
  };
}

/** How long a freshly mounted notice region stays empty before its text. */
export const NOTICE_FILL_DELAY_MS = 50;

/**
 * The notice line. A live region inserted already holding its text is
 * often not read (NVDA/Chrome, VoiceOver), so this one mounts EMPTY and the
 * first text arrives a beat later. Call sites key it by TONE, so a status
 * and an alert are never one element changing role. Within a tone the
 * region stays mounted and each event's text is a fresh `<span key={seq}>`,
 * so a repeat is an insertion into a region that already exists.
 */
function PillNoticeLine({ id, notice }: { id: string; notice: PillNotice }) {
  const [shown, setShown] = useState<PillNotice | null>(null);
  const filled = useRef(false);
  useEffect(() => {
    if (!filled.current) {
      filled.current = true;
      let fired = false;
      const timer = setTimeout(() => {
        fired = true;
        setShown(notice);
      }, NOTICE_FILL_DELAY_MS);
      return () => {
        clearTimeout(timer);
        // StrictMode (dev) runs this cleanup before the timer fires and then
        // the effect again: reset, so the re-run waits too instead of filling
        // a just-mounted region at once.
        if (!fired) filled.current = false;
      };
    }
    setShown(notice);
    return undefined;
  }, [notice]);
  return (
    <p
      id={id}
      role={notice.tone}
      className="bcc-mono basis-full text-center text-[10px] leading-snug tracking-[0.06em] text-bcc-text-secondary"
    >
      {shown !== null && <span key={shown.seq}>{shown.text}</span>}
    </p>
  );
}

/**
 * Denial codes that mean "you're signed out" (lib/permissions). F-321: a
 * signed-out viewer's Watch / Vouch / Join pill is a link to sign in (and
 * back), not a dead control.
 */
const SIGN_IN_CODES = SIGN_IN_REASON_CODES;

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

export function MessagePill({
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
  // A host that owns watch state (CardGrid, the onboarding wizard) passes
  // `onPull` + `isPulled`. Otherwise (the profile hero) the bar reads the
  // card's own `viewer_is_watching` / `viewer_watch` (F-255) — never a page
  // of /me/watching, which is partial past the 50th watch. Unknown (null)
  // disables the pill with a reason instead of offering "Watch".
  const hostOwnsWatch = onPull !== undefined;
  const viewerWatch = useViewerWatch(card);
  const effectivePulled = hostOwnsWatch ? isPulled : viewerWatch.watching;
  const watchUnknown = !hostOwnsWatch && viewerWatch.unknown;
  // F-236: a refused or failed watch surfaces through the pill's tooltip,
  // the same place a failed vouch does: the card is a fixed 440px with no
  // room for a line. Keyed on the error code, never err.message.
  const watchError = hostOwnsWatch ? null : viewerWatch.error;

  const [watchAttempt, setWatchAttempt] = useState(0);
  const handleWatchClick = () => {
    if (onPull !== undefined) {
      onPull(card);
      return;
    }
    setWatchAttempt((n) => n + 1);
    viewerWatch.toggle();
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

  // The server's permission decides first (anonymous, own card, community
  // cards are "not applicable" there); only a permitted watch can be
  // blocked by an unknown state.
  const watchPermitted = isAllowed(card.permissions, "can_watch");
  const watchAllowed = watchPermitted && !watchUnknown;

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
  // F-255: a permitted watch blocked only because the state is unknown says
  // so; otherwise the server's own reason.
  const watchLockedReason =
    watchPermitted && watchUnknown
      ? WATCH_UNKNOWN_COPY
      : unlockHint(card.permissions, "can_watch") ?? `${FOLLOW_COPY.cta} is unavailable for this card.`;
  // No frontend-written eligibility rule (§A2): the server's hint, or a
  // neutral line.
  const vouchLockedReason = unlockHint(card.permissions, "can_vouch") ?? "Not available yet.";

  const pillNotice = usePillNotice();
  const { show: showNotice } = pillNotice;
  // A failure is the latest event when it happens: it replaces whatever
  // the line was saying.
  // `watchAttempt` re-fires it when a retry fails with the SAME copy in
  // the same render (useViewerWatch's no-handle case clears and re-sets
  // the error synchronously, so the value never changes).
  useEffect(() => {
    if (watchError !== null) showNotice(watchError, "watch", "alert");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on a new error or attempt only
  }, [watchError, watchAttempt]);
  useEffect(() => {
    if (vouchError !== null) showNotice(vouchError, "vouch", "alert");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on a new error only
  }, [vouchError]);
  /** A locked pill was tapped: its reason replaces any earlier failure. */
  const explain = (reason: string, source: PillNoticeSource) => {
    viewerWatch.clearError();
    setVouchError(null);
    showNotice(reason, source);
  };
  const explainMessage = (reason: string) => explain(reason, "message");
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
        describedBy={pillNotice.describes("watch")}
        onLocked={() => explain(watchLockedReason, "watch")}
        title={
          watchError ??
          (watchAllowed
            ? effectivePulled
              ? FOLLOW_COPY.tooltipActive
              : FOLLOW_COPY.tooltipIdle
            : watchLockedReason)
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
      {neverClaimedValidator && <ValidatorMessagePill card={card} onLocked={explainMessage} />}

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
          describedBy={pillNotice.describes("vouch")}
          onLocked={() => explain(vouchLockedReason, "vouch")}
          title={
            vouchError ??
            (canVouch || hasVouched
              ? hasVouched
                ? `You vouch for ${card.name}. Click to withdraw.`
                : `Vouch for ${card.name} — ${targetKind === "user_profile" ? "back this member." : "back this page."}`
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
      {shownNotice !== null && (
        <PillNoticeLine key={shownNotice.tone} id={pillNotice.id} notice={shownNotice} />
      )}

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
          onLocked={explainMessage}
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

/** F-244: the JOIN cell when the viewer's membership could not be read. */
export const JOIN_UNKNOWN_COPY = "Couldn't check whether you can join. Reload to try again.";

/**
 * F-244: no verdict on the card at all (`can_join` absent or `null`, §3.2.4)
 * — the surface that built it has not adopted the verdict, so a reload
 * would not help; the group page has the answer.
 */
export const JOIN_ASK_PAGE_COPY = "Open the community page to see whether you can join.";

/** Locked-pill labels by the server's `can_join.reason_code`. */
const JOIN_LOCKED_LABELS: Readonly<Record<string, string>> = {
  removed: "Removed",
  requires_approval: "Private",
  invite_only: "Invite-only",
};

/** Reasons to show when the server sends no `unlock_hint`. */
const JOIN_LOCKED_FALLBACK: Readonly<Record<string, string>> = {
  removed: "A moderator removed you from this community.",
  requires_approval: "This community is private.",
  invite_only: "Members join by invitation.",
  trust_threshold: "Your standing is below what this community requires.",
  not_eligible: "You can't join this community.",
  unavailable: JOIN_UNKNOWN_COPY,
};

/**
 * JOIN-cell state machine, driven ONLY by the server's verdict on
 * `card.community_dossier` (F-244, §A2): `can_join`, `can_request_join`
 * and `viewer_membership_status`, computed by the same logic as the group
 * page. It used to recompute eligibility from `privacy` / `type` /
 * `trust_min`, which was wrong for banned viewers, delegator groups, trust
 * below the threshold, and pending requests and invites.
 *
 *   member (status, viewer_is_member or optimistic isJoined) → MEMBER ✓
 *   verdict absent / null                                    → locked, "Open the community page…"
 *   signed out (auth_required)                               → JOIN → sign in
 *   can_join.allowed (incl. verify_on_join)                  → JOIN (onJoin)
 *   nft / validator + not_eligible                           → JOIN (onJoin): the join IS the check
 *   status requested                                         → REQUESTED (locked)
 *   status invited                                           → INVITED (locked)
 *   unavailable                                              → locked "Couldn't check…"
 *   otherwise                                                → locked, label + reason
 *                                                               from can_join
 *
 * The nft / validator rule is the one GroupMembershipStrip
 * (HolderEligibilityCheck / ValidatorEligibilityCheck) and the profile
 * Groups tab (ValidatorEligibilityRow) already apply: the server sends
 * `not_eligible` for a delegator group always, and for a holder group on
 * the detail card, because no live on-chain check runs at render time —
 * the verified join settles it, and its refusal is mapped under the card.
 * All three surfaces agree.
 *
 * A closed group the viewer could ask to join (`can_request_join.allowed`)
 * still reads "Private" on the card, and its tap shows the server's hint
 * ("Visit the group page to request to join."): the request itself lives
 * in the group page's membership strip (F-272, #290). The card offers no
 * Request button of its own yet (a separate follow-up).
 *
 * Locked pills explain themselves on tap (F-321) — a title never shows on
 * a phone.
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
  const status = dossier.viewer_membership_status;
  const canJoin = dossier.can_join;
  const reason = canJoin?.reason_code ?? null;
  const isMember =
    isJoined || dossier.viewer_is_member || status === "member" || reason === "already_member";
  const onChainGated = dossier.type === "nft" || dossier.type === "validator";
  const verifies = reason === "verify_on_join" || onChainGated;
  // Not a refusal: the server cannot pre-confirm a holding or delegation
  // without a live check, so the verified join is the check (see above).
  const verifiedJoin = onChainGated && reason === "not_eligible";
  const signIn = useSignInLink();
  const pillNotice = usePillNotice();

  let joinLabel: string;
  let joinTitle: string;
  let locked = false;
  if (isMember) {
    joinLabel = "Member";
    joinTitle = "You're a member — manage membership on the community page.";
  } else if (canJoin === undefined || canJoin === null) {
    joinLabel = "Join";
    joinTitle = JOIN_ASK_PAGE_COPY;
    locked = true;
  } else if (reason !== null && SIGN_IN_CODES.has(reason)) {
    return (
      <div className="bcc-card-actions">
        <SignInPill
          color="var(--bcc-verified)"
          icon={<JoinIcon size={14} strokeWidth={1.9} aria-hidden />}
          label="Join"
          ariaLabel={`Sign in to join ${card.name}`}
          href={signIn.href}
          onClick={signIn.onClick}
        />
      </div>
    );
  } else if (canJoin.allowed || verifiedJoin) {
    // "Join" even on the holder / delegator path: the check IS the join.
    joinLabel = joinPending ? (verifies ? "Checking…" : "Joining…") : "Join";
    joinTitle =
      dossier.type === "nft" || reason === "verify_on_join"
        ? "Verifies your linked wallet holds this collection, then joins."
        : dossier.type === "validator"
          ? "Verifies your linked wallet delegates enough to this validator, then joins."
          : "Join this community.";
  } else if (status === "requested") {
    joinLabel = "Requested";
    joinTitle = dossier.can_request_join?.unlock_hint ?? "Your request to join is waiting for a moderator.";
    locked = true;
  } else if (status === "invited") {
    joinLabel = "Invited";
    joinTitle = dossier.can_request_join?.unlock_hint ?? "You've been invited to this community.";
    locked = true;
  } else {
    joinLabel = (reason !== null ? JOIN_LOCKED_LABELS[reason] : undefined) ?? "Join";
    joinTitle =
      reason === "unavailable"
        ? JOIN_UNKNOWN_COPY
        : canJoin.unlock_hint ??
          (reason !== null ? JOIN_LOCKED_FALLBACK[reason] : undefined) ??
          "You can't join this community.";
    locked = true;
  }

  const joinDisabled = !isMember && !locked && joinPending;

  return (
    <div
      className={
        pillNotice.notice !== null ? "bcc-card-actions bcc-card-actions-stacked" : "bcc-card-actions"
      }
    >
      <ActionPill
        color="var(--bcc-verified)"
        active={isMember}
        disabled={joinDisabled}
        locked={locked}
        describedBy={pillNotice.describes("join")}
        onLocked={() => pillNotice.show(joinTitle, "join")}
        title={joinTitle}
        icon={<JoinIcon size={14} strokeWidth={1.9} aria-hidden />}
        idleLabel={joinLabel}
        onLabel="Member"
        // Leaving a community is a real decision made on the community
        // page, not a hover-to-undo on a directory card.
        undoLabel="Member"
        // The name carries the visible label (WCAG 2.5.3): "Join Atlas", or
        // "Private — Atlas" for a locked pill, never "Join" under "Private".
        ariaLabel={
          isMember
            ? `You are a member of ${card.name}`
            : joinLabel === "Join"
              ? `Join ${card.name}`
              : `${joinLabel} — ${card.name}`
        }
        onClick={() => {
          if (isMember || locked || joinDisabled) return;
          if (onJoin !== undefined) onJoin(card);
        }}
      />
      {pillNotice.notice !== null && (
        <PillNoticeLine key={pillNotice.notice.tone} id={pillNotice.id} notice={pillNotice.notice} />
      )}
    </div>
  );
}
