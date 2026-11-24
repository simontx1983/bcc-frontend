"use client";

/**
 * HallMembershipControls — unified membership UX for /halls/[slug].
 *
 * Replaces the old single-purpose PrimaryHallToggle. One component
 * orchestrates four discrete viewer states with the §N7 visible-but-
 * disabled rules:
 *
 *   anonymous              → SIGN IN TO JOIN link, back to this Hall
 *                            (F-321 / M-gr4; it was a disabled JOIN)
 *   non-member             → JOIN enabled (primary action). Primary
 *                            controls absent — you must be a member
 *                            before designating a primary.
 *   member, not primary    → row of two buttons:
 *                              SET AS PRIMARY (primary action)
 *                              LEAVE          (secondary action)
 *   member, IS primary     → row of two buttons:
 *                              ★ PRIMARY · CLEAR (primary action)
 *                              LEAVE             (secondary action)
 *
 * Leave-while-primary is a multi-step concern: the server handles the
 * atomic primary-pointer cleanup (§E3 single-graph rule), but UX-wise
 * the viewer confirms first, so they know their primary designation is
 * also disappearing. Clearing the primary confirms too (F-317 M-gr4): it
 * drops the Hall from their card and their feed, and it sat one tap away
 * with nothing in between. Both use the shared ConfirmDialog (focus trap,
 * focus return, Escape), not the browser's native confirm.
 *
 * No cache surgery — the surrounding page is a server component. We
 * call `router.refresh()` in onSuccess to re-render with fresh data.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { HALLS_TAB_HREF } from "@/components/communities/halls-tab-href";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import {
  useClearPrimaryHallMutation,
  useJoinHallMutation,
  useLeaveHallMutation,
  useSetPrimaryHallMutation,
} from "@/hooks/useHallsPrimary";
import { humanizeCode } from "@/lib/api/errors";
import { useSignInLink } from "@/lib/auth/sign-in-link";
import type { BccApiError, HallItem } from "@/lib/api/types";

interface HallMembershipControlsProps {
  groupId: number;
  /** Current viewer membership state (null when anonymous). */
  membership: HallItem["viewer_membership"];
}

/** Shared copy for the two confirms, so tests and the dialogs agree. */
export const HALL_CONFIRM_COPY = {
  leave: {
    title: "Leave this Hall?",
    body: "It's your primary Hall, so leaving also clears it from your card and your feed. You can join again any time.",
    confirm: "LEAVE",
    cancel: "STAY",
  },
  clear: {
    title: "Clear your primary Hall?",
    body: "It stops showing on your card and stops shaping your feed. You stay a member.",
    confirm: "CLEAR",
    cancel: "KEEP IT",
  },
  retry: "TRY AGAIN",
} as const;

type Confirming = "leave" | "clear" | null;

export function HallMembershipControls({
  groupId,
  membership,
}: HallMembershipControlsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const primaryRef = useRef<HTMLButtonElement | null>(null);
  // F-317 M-gr2 (Hall side): set by a mutation that succeeded (or found the
  // state moved), just before it refreshes the page; spent by every
  // refresh. Same rules as the group page strip.
  const actedRef = useRef(false);

  const onSuccess = () => {
    setError(null);
    setConfirming(null);
    actedRef.current = true;
    router.refresh();
  };
  // Copy is per action (F-317 M-gr1): the same code means different things
  // on join and on set-primary. When the refusal says the server's state
  // moved under the viewer, the page re-reads, so the line can say it is
  // showing the latest.
  const onErrorFor = (action: HallAction) => (err: BccApiError) => {
    setError(humanizeError(err, action));
    if (staleState(err, action)) {
      actedRef.current = true;
      router.refresh();
    }
  };

  // LEAVE is the one control a refresh takes away (the viewer is no longer
  // a member), and focus fell to <body> with it. When the membership VALUE
  // changed after a mutation here, focus moves to the button that remains
  // (JOIN HALL / SET AS PRIMARY: the same element, kept by position).
  // Focus the viewer has moved somewhere else is left alone. Declared
  // before the effect below, so it reads the flag before that one spends it.
  const isMember = membership?.is_member ?? null;
  const isPrimary = membership?.is_primary ?? null;
  useEffect(() => {
    if (!actedRef.current) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body) return;
    primaryRef.current?.focus();
  }, [isMember, isPrimary]);
  useEffect(() => {
    actedRef.current = false;
  }, [membership]);

  const joinMut    = useJoinHallMutation({ onSuccess, onError: onErrorFor("join") });
  const leaveMut   = useLeaveHallMutation({ onSuccess, onError: onErrorFor("leave") });
  const setPrimMut = useSetPrimaryHallMutation({ onSuccess, onError: onErrorFor("primary") });
  const clearMut   = useClearPrimaryHallMutation({ onSuccess, onError: onErrorFor("primary") });

  const isPending =
    joinMut.isPending ||
    leaveMut.isPending ||
    setPrimMut.isPending ||
    clearMut.isPending;

  const state = resolveState(membership);
  const signIn = useSignInLink(HALLS_TAB_HREF);

  // ─── Anonymous ─────────────────────────────────────────────────
  // F-321 / M-gr4: signed out, the way forward is signing in, so the
  // control does that (and returns here) instead of being a disabled
  // button explained only by a tooltip touch users never see.
  if (state.kind === "anon") {
    return (
      <ControlRow>
        <Link
          href={signIn.href}
          onClick={signIn.onClick}
          className="bcc-stencil inline-flex min-h-[44px] items-center rounded-sm bg-ink px-5 text-[12px] tracking-[0.2em] text-cardstock transition hover:bg-blueprint"
        >
          SIGN IN TO JOIN
        </Link>
      </ControlRow>
    );
  }

  // ─── Authed, not a member ──────────────────────────────────────
  if (state.kind === "non_member") {
    return (
      <>
        {/* First in both branches, so it is the same element when the
            refreshed membership switches branch and remembers what it saw. */}
        <HallAnnouncer isMember={isMember} isPrimary={isPrimary} />
        <ControlRow>
          <PrimaryButton
            buttonRef={primaryRef}
            disabled={isPending}
            tooltip="Join this Hall to participate."
            onClick={() => {
              setError(null);
              joinMut.mutate(groupId);
            }}
            pending={joinMut.isPending}
          >
            JOIN HALL
          </PrimaryButton>
        </ControlRow>
        {error !== null && <ErrorLine message={error} />}
      </>
    );
  }

  // ─── Authed, member ────────────────────────────────────────────
  // Setting a primary is one tap; clearing it, or leaving the primary
  // Hall, confirms first. A failure there shows inside the dialog, which
  // stays open with TRY AGAIN; cancelling clears it.
  const handleSetClear = () => {
    setError(null);
    if (state.isPrimary) {
      clearMut.reset();
      setConfirming("clear");
    } else {
      setPrimMut.mutate(groupId);
    }
  };

  const handleLeave = () => {
    setError(null);
    if (state.isPrimary) {
      leaveMut.reset();
      setConfirming("leave");
      return;
    }
    leaveMut.mutate(groupId);
  };

  const closeConfirm = () => {
    setError(null);
    setConfirming(null);
  };

  return (
    <>
      {/* First in both branches, so it is the same element when the
          refreshed membership switches branch and remembers what it saw. */}
      <HallAnnouncer isMember={isMember} isPrimary={isPrimary} />
      <ControlRow>
        <PrimaryButton
          buttonRef={primaryRef}
          disabled={isPending}
          tooltip={
            state.isPrimary
              ? "This is your primary Hall. Click to clear."
              : "Set this as your primary Hall — it'll show on your card and bias your feed."
          }
          onClick={handleSetClear}
          pending={setPrimMut.isPending || clearMut.isPending}
          variant={state.isPrimary ? "primary-active" : "primary"}
        >
          {state.isPrimary ? "★ PRIMARY · CLEAR" : "SET AS PRIMARY"}
        </PrimaryButton>
        <SecondaryButton
          disabled={isPending}
          tooltip="Leave this Hall. You can re-join any time."
          onClick={handleLeave}
          pending={leaveMut.isPending}
        >
          LEAVE
        </SecondaryButton>
      </ControlRow>
      {error !== null && confirming === null && <ErrorLine message={error} />}
      {confirming === "leave" && (
        <ConfirmDialog
          title={HALL_CONFIRM_COPY.leave.title}
          body={HALL_CONFIRM_COPY.leave.body}
          confirmLabel={HALL_CONFIRM_COPY.leave.confirm}
          cancelLabel={HALL_CONFIRM_COPY.leave.cancel}
          retryLabel={HALL_CONFIRM_COPY.retry}
          errorMessage={error}
          pending={leaveMut.isPending}
          onConfirm={() => {
            setError(null);
            leaveMut.mutate(groupId);
          }}
          onCancel={closeConfirm}
        />
      )}
      {confirming === "clear" && (
        <ConfirmDialog
          title={HALL_CONFIRM_COPY.clear.title}
          body={HALL_CONFIRM_COPY.clear.body}
          confirmLabel={HALL_CONFIRM_COPY.clear.confirm}
          cancelLabel={HALL_CONFIRM_COPY.clear.cancel}
          retryLabel={HALL_CONFIRM_COPY.retry}
          errorMessage={error}
          pending={clearMut.isPending}
          onConfirm={() => {
            setError(null);
            clearMut.mutate();
          }}
          onCancel={closeConfirm}
        />
      )}
    </>
  );
}

/**
 * A polite live region that speaks when the refreshed page changes where
 * the viewer stands in this Hall: joined, left, primary set or cleared.
 * The buttons' labels change silently otherwise. Mounted empty and only
 * filled by a change from the previous render, so a page that loads in
 * any state says nothing. Same shape as the group page strip's announcer;
 * a Hall's states differ (is_primary, no join requests).
 */
function HallAnnouncer({
  isMember,
  isPrimary,
}: {
  isMember: boolean | null;
  isPrimary: boolean | null;
}) {
  const prev = useRef({ isMember, isPrimary });
  const [message, setMessage] = useState("");
  useEffect(() => {
    const before = prev.current;
    prev.current = { isMember, isPrimary };
    if (before.isMember === false && isMember === true) setMessage("You joined this Hall.");
    else if (before.isMember === true && isMember === false) setMessage("You left this Hall.");
    else if (before.isPrimary === false && isPrimary === true) setMessage("This is now your primary Hall.");
    else if (before.isPrimary === true && isPrimary === false) setMessage("Your primary Hall is cleared.");
  }, [isMember, isPrimary]);
  return (
    <p role="status" aria-live="polite" className="sr-only">
      {message}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components (presentation-only)
// ─────────────────────────────────────────────────────────────────────

function ControlRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

/**
 * `disabled` here is aria-disabled, not the attribute: a disabled button
 * drops keyboard focus to <body> the moment it is pressed (F-317 M-gr2),
 * so the press is refused in the handler instead. `pending` also marks
 * the button busy.
 */
interface ButtonProps {
  disabled?: boolean;
  pending?: boolean;
  tooltip: string;
  onClick: () => void;
  children: React.ReactNode;
}

function PrimaryButton({
  disabled = false,
  pending = false,
  tooltip,
  onClick,
  children,
  variant = "primary",
  buttonRef,
}: ButtonProps & {
  variant?: "primary" | "primary-active";
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  const enabledClass =
    variant === "primary-active"
      ? "bg-cardstock text-ink ring-1 ring-cardstock-edge hover:bg-cardstock-deep"
      : "bg-ink text-cardstock hover:bg-blueprint";
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      title={tooltip}
      aria-disabled={disabled}
      aria-busy={pending}
      className={
        "bcc-stencil inline-flex min-h-[44px] items-center rounded-sm px-5 text-[12px] tracking-[0.2em] transition " +
        (disabled
          ? "cursor-not-allowed bg-cardstock-deep/40 text-ink-soft/60"
          : enabledClass)
      }
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function SecondaryButton({
  disabled = false,
  pending = false,
  tooltip,
  onClick,
  children,
}: ButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        onClick();
      }}
      title={tooltip}
      aria-disabled={disabled}
      aria-busy={pending}
      className={
        "bcc-mono inline-flex min-h-[44px] items-center rounded-sm px-4 text-[10px] tracking-[0.18em] transition " +
        (disabled
          ? "cursor-not-allowed text-ink-soft/40"
          : "text-cardstock-deep hover:text-ink")
      }
    >
      {pending ? "Saving…" : children}
    </button>
  );
}

function ErrorLine({ message }: { message: string }) {
  return (
    <p role="alert" className="bcc-mono mt-2 text-bcc-text-error">
      {message}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────
// State machine
// ─────────────────────────────────────────────────────────────────────

type ResolvedState =
  | { kind: "anon" }
  | { kind: "non_member" }
  | { kind: "member"; isPrimary: boolean };

function resolveState(membership: HallItem["viewer_membership"]): ResolvedState {
  if (membership === null) {
    return { kind: "anon" };
  }
  if (!membership.is_member) {
    return { kind: "non_member" };
  }
  return { kind: "member", isPrimary: membership.is_primary };
}

type HallAction = "join" | "leave" | "primary";

/**
 * A refusal that means the server's state moved under the viewer: a 409
 * (already a member, §4.7), or a set-primary refused because they are not
 * a member any more. The page re-reads on these.
 */
function staleState(err: BccApiError, action: HallAction): boolean {
  return err.code === "bcc_conflict" || (action === "primary" && err.code === "bcc_forbidden");
}

/**
 * §γ — keyed on err.code, never err.message.
 *
 * `bcc_forbidden` on a JOIN (contract §4.7) is a suspended account, a Hall
 * closed to open joining, or a moderator's ban, and nothing in
 * `error.data` tells them apart, so the line is one that is true of all
 * three. It used to say "This Hall doesn't accept open membership." to
 * every one of them, a suspended member included. On set-primary the same
 * code means "not a member of this Hall" (§4.7).
 */
function humanizeError(err: unknown, action: HallAction): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in first.",
      bcc_forbidden:
        action === "join"
          ? "You can't join this Hall right now."
          : action === "primary"
            ? "Only members can make a Hall their primary. Showing the latest."
            : "Couldn't update your Hall. Try again.",
      bcc_conflict: "This changed a moment ago. Showing the latest.",
      bcc_not_found: "This Hall no longer exists.",
      bcc_unavailable: "Membership service is down. Try again shortly.",
      bcc_rate_limited: "Slow down — try again in a minute.",
      bcc_invalid_request: "Couldn't update your Hall. Try again.",
    },
    "Something went wrong. Try again.",
  );
}
