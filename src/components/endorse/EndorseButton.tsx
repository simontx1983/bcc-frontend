"use client";

/**
 * §V1.5 EndorseButton — sibling to ReviewCallout / DisputeCallout on
 * entity profile pages.
 *
 * State machine (server-driven per §A2 — gates resolved into a
 * Permission shape inside CardViewService::resolvePagePermissions):
 *
 *   anonymous              → "ENDORSE" disabled, sign-in tooltip
 *   has endorsed           → "REMOVE ENDORSEMENT" enabled, confirm-and-revoke
 *                            (gate intentionally NOT re-checked here —
 *                            removing your own work is always allowed)
 *   can endorse            → "ENDORSE" enabled, click-to-confirm-and-post
 *   gated (quest/age/etc.) → "ENDORSE" disabled, server-rendered hint
 *
 * Endorsements carry no body in V1 — the click is the whole interaction.
 * (Adding a reason field is a V2 concern; the backend already accepts
 * one but we keep the surface minimal.)
 *
 * After a successful endorse/revoke we invalidate the card query root
 * + call router.refresh() so the EntityProfile server component picks
 * up the fresh `viewer_has_endorsed` and `endorsements` count.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useEndorsePage, useRevokeEndorsement } from "@/hooks/useEndorse";
import { humanizeCode } from "@/lib/api/errors";

interface EndorseButtonProps {
  pageId: number;
  pageName: string;
  /** card.permissions.can_endorse.allowed */
  canEndorse: boolean;
  /** card.endorse_unlock_hint — null when allowed. */
  unlockHint: string | null;
  /** card.viewer_has_endorsed */
  hasEndorsed: boolean;
  /** Whether anybody is signed in. */
  viewerAuthed: boolean;
}

export function EndorseButton({
  pageId,
  pageName,
  canEndorse,
  unlockHint,
  hasEndorsed,
  viewerAuthed,
}: EndorseButtonProps) {
  const router = useRouter();
  const [errorText, setErrorText] = useState<string | null>(null);

  const endorse = useEndorsePage({
    onSuccess: () => {
      setErrorText(null);
      router.refresh();
    },
    onError: (err) => setErrorText(humanizeError(err)),
  });

  const revoke = useRevokeEndorsement({
    onSuccess: () => {
      setErrorText(null);
      router.refresh();
    },
    onError: (err) => setErrorText(humanizeError(err)),
  });

  const handleEndorse = () => {
    if (!viewerAuthed || !canEndorse) return;
    setErrorText(null);
    endorse.mutate({ page_id: pageId, context: "general" });
  };

  const handleRevoke = () => {
    if (!viewerAuthed) return;
    const ok = window.confirm(
      `Remove your endorsement of ${pageName}? This drops the trust bonus you contributed.`,
    );
    if (!ok) return;
    setErrorText(null);
    revoke.mutate({ page_id: pageId, context: "general" });
  };

  // ── Authed + already endorsed → REMOVE ENDORSEMENT ─────────────────
  if (viewerAuthed && hasEndorsed) {
    const removing = revoke.isPending;
    return (
      <>
        <button
          type="button"
          onClick={handleRevoke}
          disabled={removing}
          aria-disabled={removing}
          title={`Remove your endorsement of ${pageName}.`}
          className={
            "bcc-stencil mt-4 w-fit rounded-sm px-4 py-2 text-[11px] tracking-[0.2em] transition " +
            (removing
              ? "cursor-wait bg-bcc-surface-active text-bcc-text-muted"
              : "ring-1 ring-cardstock-edge bg-cardstock text-ink hover:bg-cardstock-deep")
          }
          style={
            !removing
              ? { boxShadow: "inset 0 -3px 0 var(--verified)" }
              : undefined
          }
        >
          {removing ? "REMOVING…" : "REMOVE ENDORSEMENT"}
        </button>
        {errorText !== null && (
          <p role="alert" className="bcc-mono mt-2 text-[11px] text-safety">
            {errorText}
          </p>
        )}
      </>
    );
  }

  // ── Default → ENDORSE (enabled or visible-disabled with hint) ──────
  const enabled = viewerAuthed && canEndorse;
  const tooltip = !viewerAuthed
    ? "Sign in to endorse."
    : !canEndorse
      ? unlockHint ?? `You can't endorse ${pageName} right now.`
      : `Endorse ${pageName}. Adds a long-term trust boost to their score — heavier than a Vouch, builds over time.`;

  const pending = endorse.isPending;

  return (
    <>
      <button
        type="button"
        onClick={handleEndorse}
        disabled={!enabled || pending}
        aria-disabled={!enabled || pending}
        title={tooltip}
        className={
          "bcc-stencil mt-4 w-fit rounded-sm px-4 py-2 text-[11px] tracking-[0.2em] transition " +
          (enabled && !pending
            ? "bg-cardstock text-ink ring-1 ring-cardstock-edge hover:bg-cardstock-deep"
            : "cursor-not-allowed bg-bcc-surface-active text-bcc-text-muted")
        }
        style={
          enabled && !pending
            ? { boxShadow: "inset 0 -3px 0 var(--verified)" }
            : undefined
        }
      >
        {pending ? "ENDORSING…" : "ENDORSE"}
      </button>
      {errorText !== null && (
        <p role="alert" className="bcc-mono mt-2 text-[11px] text-safety">
          {errorText}
        </p>
      )}
    </>
  );
}

function humanizeError(err: unknown): string {
  // Phase γ doctrine: the canonical UX path for eligibility errors is
  // the server-supplied `permissions.can_endorse.allowed` + `unlock_hint`
  // gate (resolved by CardViewService::resolvePagePermissions). When the
  // gate says allowed=true and a 4xx still comes back, that's a race
  // condition — these copy strings are the race fallback only.
  //
  // Codes map to TrustRestController::endorse() / ::revoke_endorsement()
  // (contract v1.20+, §1.4.6). The server's `err.message` is never
  // user-visible via `humanizeCode` — including for soft gates where
  // the server-supplied `data.unlock_hint` is the authoritative copy
  // surfaced via the EndorseButton's `unlockHint` prop instead.
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in first.",
      bcc_invalid_request: "We couldn't endorse this page right now.",
      // cadence-pressure-guard:allow — unlock-requirement explanation on a denied action, not a schedule nudge
      bcc_permission_denied: "You haven't unlocked endorsements yet.",
      bcc_forbidden: "You can't endorse this page.",
      bcc_endorse_self: "You can't endorse your own page.",
      bcc_fraud_locked: "Your account is temporarily restricted from endorsing.",
      bcc_conflict: "You've already endorsed this page. Refresh to see.",
      bcc_not_found: "That endorsement no longer exists. Refresh to see.",
      bcc_rate_limited: "Too many endorsements just now. Wait a moment.",
    },
    "Couldn't endorse. Try again.",
  );
}
