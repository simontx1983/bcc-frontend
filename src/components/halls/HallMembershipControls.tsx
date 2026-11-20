"use client";

/**
 * HallMembershipControls — unified membership UX for /halls/[slug].
 *
 * Replaces the old single-purpose PrimaryHallToggle. One component
 * orchestrates four discrete viewer states with the §N7 visible-but-
 * disabled rules:
 *
 *   anonymous              → JOIN disabled, tooltip "Sign in to join."
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
 * we surface a native confirm so the user knows their primary
 * designation is also disappearing.
 *
 * No cache surgery — the surrounding page is a server component. We
 * call `router.refresh()` in onSuccess to re-render with fresh data.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

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

export function HallMembershipControls({
  groupId,
  membership,
}: HallMembershipControlsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const onSuccess = () => {
    setError(null);
    router.refresh();
  };
  // Copy is per action (F-317 M-gr1): the same code means different things
  // on join and on set-primary. When the refusal says the server's state
  // moved under the viewer, the page re-reads, so the line can say it is
  // showing the latest.
  const onErrorFor = (action: HallAction) => (err: BccApiError) => {
    setError(humanizeError(err, action));
    if (staleState(err, action)) router.refresh();
  };

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
  const signIn = useSignInLink("/halls");

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
        <ControlRow>
          <PrimaryButton
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
  const handleSetClear = () => {
    setError(null);
    if (state.isPrimary) {
      clearMut.mutate();
    } else {
      setPrimMut.mutate(groupId);
    }
  };

  const handleLeave = () => {
    setError(null);
    if (state.isPrimary) {
      const ok = window.confirm(
        "Leaving will also clear your primary Hall. Continue?"
      );
      if (!ok) return;
    }
    leaveMut.mutate(groupId);
  };

  return (
    <>
      <ControlRow>
        <PrimaryButton
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
      {error !== null && <ErrorLine message={error} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components (presentation-only)
// ─────────────────────────────────────────────────────────────────────

function ControlRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3">{children}</div>;
}

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
}: ButtonProps & { variant?: "primary" | "primary-active" }) {
  const enabledClass =
    variant === "primary-active"
      ? "bg-cardstock text-ink ring-1 ring-cardstock-edge hover:bg-cardstock-deep"
      : "bg-ink text-cardstock hover:bg-blueprint";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      aria-disabled={disabled}
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
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      aria-disabled={disabled}
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
