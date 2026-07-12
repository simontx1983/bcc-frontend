/**
 * AuthorVouchButton — the per-author Vouch toggle that rides next to a
 * person's name (feed bylines + commenter names).
 *
 * Vouch is *author credibility* ("I back this operator"), one vouch per
 * person, full-weight via the existing `/me/attestations` API — NOT a post
 * reaction. So this compact toggle reads identically wherever the author
 * appears: vouch them from one post's byline and every other surface that
 * shows their name reads VOUCHED. It mirrors the profile
 * `AttestationActionCluster` Vouch button exactly (cast when not vouched,
 * revoke when vouched), just in a byline-sized pill.
 *
 * State is server-driven (the author block carries `viewer_attestation` +
 * `can_vouch`); the broad cache invalidation in `useCastAttestation` /
 * `useRevokeAttestation` (incl. `["user-profile"]`) refreshes every byline
 * for that author together. No business logic here — the server owns
 * eligibility; this only renders + dispatches.
 *
 * Self-contained (owns its own mutation hooks) so it can drop into the
 * memoized AuthorBadge sub-tree without threading a per-render closure
 * through the memo boundary.
 */

"use client";

import { memo, useState } from "react";

import {
  useCastAttestation,
  useRevokeAttestation,
} from "@/hooks/useAttestations";
import { humanizeCode } from "@/lib/api/errors";
import type {
  AuthorVouchPermission,
  BccApiError,
  ViewerAttestation,
} from "@/lib/api/types";

export interface AuthorVouchButtonProps {
  /** Author user id — the `target_id` for the `user_profile` vouch. */
  targetUserId: number;
  /** Author display name (drives the accessible label). */
  displayName: string;
  /** The viewer's own attestation state on this author (authed-only). */
  viewerAttestation?: ViewerAttestation | undefined;
  /** Whether the viewer may vouch (authed-only). */
  canVouch?: AuthorVouchPermission | undefined;
  /**
   * Visual size. "byline" (default) is the compact chip that rides next
   * to a name; "card" is the rounded-full pill used in the author card's
   * action row, sized to sit beside the Follow pill. Same behavior, only
   * the shape/scale differs.
   */
  size?: "byline" | "card";
  /** Extra classes for the card-variant wrapper (e.g. `flex-1` for a 50/50 row). */
  className?: string;
}

function humanizeVouchError(err: BccApiError): string {
  if (err.code === "bcc_attestation_ineligible") {
    const data = err.data;
    if (data !== null && typeof data === "object" && !Array.isArray(data)) {
      const hint = (data as Record<string, unknown>)["unlock_hint"];
      if (typeof hint === "string" && hint !== "") {
        return hint;
      }
    }
  }
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in to vouch.",
      bcc_rate_limited: "Too many actions just now. Wait a moment.",
      bcc_attestation_self: "You can't vouch for yourself.",
      bcc_attestation_fraud_blocked:
        "Your account is temporarily restricted from vouching.",
      bcc_not_found: "Vouch not found.",
      bcc_forbidden: "You can only act on your own vouches.",
    },
    "Couldn't update your vouch. Try again.",
  );
}

function AuthorVouchButtonImpl({
  targetUserId,
  displayName,
  viewerAttestation,
  canVouch,
  size = "byline",
  className = "",
}: AuthorVouchButtonProps) {
  const [errorText, setErrorText] = useState<string | null>(null);

  const castMutation = useCastAttestation({
    onSuccess: () => setErrorText(null),
    onError: (err) => setErrorText(humanizeVouchError(err)),
  });
  const revokeMutation = useRevokeAttestation({
    onSuccess: () => setErrorText(null),
    onError: (err) => setErrorText(humanizeVouchError(err)),
  });

  const hasVouched = viewerAttestation?.vouch != null;
  const allowed = canVouch?.allowed === true;

  // Surface the toggle to eligible viewers, OR to anyone who already
  // vouched (so a legacy light-voucher still sees VOUCHED and can revoke).
  // Self / anon / below-Neutral with no prior vouch → nothing on the
  // byline (the aspirational sign-in CTA lives on the profile cluster).
  if (targetUserId <= 0 || (!allowed && !hasVouched)) {
    return null;
  }

  const isPending = castMutation.isPending || revokeMutation.isPending;

  const handleClick = () => {
    if (isPending) {
      return;
    }
    setErrorText(null);
    if (hasVouched && viewerAttestation?.vouch?.id != null) {
      revokeMutation.mutate(viewerAttestation.vouch.id);
      return;
    }
    castMutation.mutate({
      kind: "vouch",
      target_kind: "user_profile",
      target_id: targetUserId,
    });
  };

  const label = isPending
    ? hasVouched
      ? "REVOKING…"
      : "VOUCHING…"
    : hasVouched
      ? "VOUCHED"
      : "VOUCH";

  // Cast state reads as a filled "verified" pill; the un-cast state is a
  // quiet outline that invites the action without shouting in a dense row.
  const pillStyle = hasVouched
    ? {
        color: "var(--verified)",
        background: "rgb(var(--verified-rgb) / 0.12)",
        border: "1px solid rgb(var(--verified-rgb) / 0.45)",
      }
    : {
        color: "var(--safety)",
        background: "transparent",
        border: "1px solid var(--safety)",
      };

  const isCard = size === "card";

  const button = (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-busy={isPending}
      aria-pressed={hasVouched}
      aria-label={
        hasVouched
          ? `Remove your vouch for ${displayName}`
          : `Vouch for ${displayName}`
      }
      title={
        hasVouched
          ? `You vouch for ${displayName}. Click to revoke.`
          : `Vouch for ${displayName} — back this operator.`
      }
      className={
        isCard
          ? // Card variant shares the Follow button's shape, stencil font,
            // 1.5px border, and hover fill (via .bcc-btn-vouch[-on]) so the
            // two pills read as one equal-height set.
            `bcc-btn bcc-btn-sm w-full ${hasVouched ? "bcc-btn-vouch-on" : "bcc-btn-vouch"}`
          : "bcc-mono shrink-0 rounded px-1.5 py-0.5 text-[10px] tracking-[0.18em] transition-opacity disabled:opacity-60"
      }
      style={isCard ? undefined : pillStyle}
    >
      {label}
    </button>
  );

  // Card variant is a full-width block (it lives in a flex-1 slot beside
  // Follow); byline variant is an inline chip that rides next to a name.
  if (isCard) {
    return (
      <span className={`flex w-full flex-col gap-1 ${className}`}>
        {button}
        {errorText !== null && (
          <span
            role="status"
            className="bcc-mono text-[10px] leading-snug text-[color:var(--danger)]"
          >
            {errorText}
          </span>
        )}
      </span>
    );
  }

  return (
    <span className="inline-flex shrink-0 items-baseline gap-1.5">
      {button}
      {errorText !== null && (
        <span
          role="status"
          className="bcc-mono text-[10px] leading-snug text-[color:var(--danger)]"
        >
          {errorText}
        </span>
      )}
    </span>
  );
}

export const AuthorVouchButton = memo(AuthorVouchButtonImpl);
AuthorVouchButton.displayName = "AuthorVouchButton";
