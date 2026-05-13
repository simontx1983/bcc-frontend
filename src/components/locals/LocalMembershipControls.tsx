"use client";

/**
 * LocalMembershipControls — unified membership UX for /locals/[slug].
 *
 * Replaces the old single-purpose PrimaryLocalToggle. One component
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

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  useClearPrimaryLocalMutation,
  useJoinLocalMutation,
  useLeaveLocalMutation,
  useSetPrimaryLocalMutation,
} from "@/hooks/useLocalsPrimary";
import { humanizeCode } from "@/lib/api/errors";
import type { LocalItem } from "@/lib/api/types";

interface LocalMembershipControlsProps {
  groupId: number;
  /** Current viewer membership state (null when anonymous). */
  membership: LocalItem["viewer_membership"];
}

export function LocalMembershipControls({
  groupId,
  membership,
}: LocalMembershipControlsProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const onSuccess = () => {
    setError(null);
    router.refresh();
  };
  const onError = (err: unknown) => setError(humanizeError(err));

  const joinMut    = useJoinLocalMutation({ onSuccess, onError });
  const leaveMut   = useLeaveLocalMutation({ onSuccess, onError });
  const setPrimMut = useSetPrimaryLocalMutation({ onSuccess, onError });
  const clearMut   = useClearPrimaryLocalMutation({ onSuccess, onError });

  const isPending =
    joinMut.isPending ||
    leaveMut.isPending ||
    setPrimMut.isPending ||
    clearMut.isPending;

  const state = resolveState(membership);

  // ─── Anonymous ─────────────────────────────────────────────────
  if (state.kind === "anon") {
    return (
      <ControlRow>
        <PrimaryButton
          disabled
          tooltip="Sign in to join this Local."
          onClick={() => undefined}
        >
          JOIN LOCAL
        </PrimaryButton>
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
            tooltip="Join this Local to participate."
            onClick={() => {
              setError(null);
              joinMut.mutate(groupId);
            }}
            pending={joinMut.isPending}
          >
            JOIN LOCAL
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
        "Leaving will also clear your primary Local. Continue?"
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
              ? "This is your primary Local. Click to clear."
              : "Set this as your primary Local — it'll show on your card and bias your feed."
          }
          onClick={handleSetClear}
          pending={setPrimMut.isPending || clearMut.isPending}
          variant={state.isPrimary ? "primary-active" : "primary"}
        >
          {state.isPrimary ? "★ PRIMARY · CLEAR" : "SET AS PRIMARY"}
        </PrimaryButton>
        <SecondaryButton
          disabled={isPending}
          tooltip="Leave this Local. You can re-join any time."
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
        "bcc-stencil rounded-sm px-5 py-2.5 text-[12px] tracking-[0.2em] transition " +
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
        "bcc-mono rounded-sm px-4 py-2 text-[10px] tracking-[0.18em] transition " +
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
    <p role="alert" className="bcc-mono mt-2 text-safety">
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

function resolveState(membership: LocalItem["viewer_membership"]): ResolvedState {
  if (membership === null) {
    return { kind: "anon" };
  }
  if (!membership.is_member) {
    return { kind: "non_member" };
  }
  return { kind: "member", isPrimary: membership.is_primary };
}

function humanizeError(err: unknown): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in first.",
      bcc_forbidden: "This Local doesn't accept open membership.",
      bcc_not_found: "This Local no longer exists.",
      bcc_unavailable: "Membership service is down. Try again shortly.",
      bcc_rate_limited: "Slow down — try again in a minute.",
      bcc_invalid_request: "Couldn't update your Local. Try again.",
    },
    "Something went wrong. Try again.",
  );
}
