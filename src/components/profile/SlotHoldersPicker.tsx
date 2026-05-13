"use client";

/**
 * SlotHoldersPicker — §J.1 Stand Behind bandwidth picker.
 *
 * Surfaces only when a stand_behind cast returns
 * `bcc_attestation_bandwidth_exhausted` (409). Renders the operator's
 * currently-active stand_behind commitments and offers a per-row
 * Release affordance.
 *
 * Emotional frame (locked by Phillip's slot-holders directive):
 *
 *   "Which of these commitments still reflects my assessment?"
 *
 *   — NOT —
 *
 *   "Which slot should I free up?"
 *
 * Concretely this means:
 *
 *   - **Reflective dialog tone.** Title is "Standing Behind" — not
 *     "Allocation," "Slots," or any portfolio-language framing. The
 *     body intro names the action as judgment ("if your assessment
 *     has changed"), not optimization ("free a slot for a better
 *     pick").
 *   - **Quiet row treatment.** Each row carries only: target link
 *     + label, relative-time the commitment was cast, optional
 *     context note. NO score, NO badges, NO reliability standing,
 *     NO ranking chrome. The point is the operator's own
 *     reflection, not comparison between targets.
 *   - **Calm "Release" affordance.** "Release" reads softer than
 *     "Revoke" — frames the action as letting-go rather than
 *     destruction. Button uses the neutral utility tone, not a
 *     destructive-red treatment. No confirmation dialog — revoke
 *     is reversible via re-cast at any time (the constitution
 *     §J.3 explicitly says revocation has zero reputation-score
 *     impact on the attestor).
 *   - **No prestige anxiety.** Copy never mentions "your tier,"
 *     "slot count," or numeric thresholds. The header says
 *     "Standing Behind," not "X of N slots used."
 *
 * Mutation choreography:
 *
 *   1. Cluster hits bandwidth_exhausted; picker opens with the
 *      server's slot_holders[] + remembers the original cast request.
 *   2. User clicks Release on row X.
 *   3. revokeAttestation(X) fires. Row dims while pending; error
 *      surfaces inline below the row on failure.
 *   4. On revoke success, the cluster's onRetry callback fires the
 *      original cast (now with a free slot). Loading copy switches
 *      to a quiet "Adding…" state on the row.
 *   5. On retry success the picker dismisses. The cluster surfaces
 *      the new cast state via its normal viewer_attestation prop
 *      flow — no toast, no celebration, no flicker.
 *
 * @see SLOT_HOLDERS_PICKER_INVARIANTS in docs/trust-attestation-layer.md
 */

import { useState } from "react";

import { humanizeCode } from "@/lib/api/errors";
import type { BccApiError, SlotHolder } from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

export interface SlotHoldersPickerProps {
  open: boolean;
  /** Bounded ≤ 10 by §J.1; server-ordered oldest-first. */
  holders: SlotHolder[];
  /**
   * Total slots the operator has. Surfaced only as quiet context
   * in the dialog body — never as a "score" or numeric badge.
   */
  slotsTotal: number;
  /** Called when the user clicks Release on a row. */
  onRelease: (holderId: number) => Promise<void> | void;
  /**
   * Set true while a release + retry is in flight. Disables the
   * other Release buttons + dims the chosen row.
   */
  releasingHolderId: number | null;
  /**
   * Set true while the cast retry (post-release) is in flight.
   * Distinguishes the visual state from a release that's still
   * mid-revoke vs the second-leg cast.
   */
  retryingCast: boolean;
  /**
   * Latest BccApiError from either the revoke or the retry-cast.
   * Renders below the row that was being released so the operator
   * sees the failure in context.
   */
  error: BccApiError | null;
  onDismiss: () => void;
}

export function SlotHoldersPicker({
  open,
  holders,
  slotsTotal,
  onRelease,
  releasingHolderId,
  retryingCast,
  error,
  onDismiss,
}: SlotHoldersPickerProps) {
  if (!open) {
    return null;
  }

  const errorText = error !== null ? humanizeReleaseError(error) : null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label="Standing Behind"
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-4 backdrop-blur-sm md:items-center"
      onClick={(e) => {
        // Backdrop click closes only when no mutation is in flight,
        // so a slow network can't strand the picker mid-flow.
        if (
          e.target === e.currentTarget &&
          releasingHolderId === null &&
          !retryingCast
        ) {
          onDismiss();
        }
      }}
    >
      <div className="bcc-panel relative w-full max-w-xl p-6 md:p-8">
        <button
          type="button"
          onClick={() => {
            if (releasingHolderId === null && !retryingCast) {
              onDismiss();
            }
          }}
          aria-label="Close"
          disabled={releasingHolderId !== null || retryingCast}
          className="bcc-mono absolute right-4 top-4 text-cardstock-deep transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          ESC
        </button>

        <header className="mb-5 pr-12">
          <p className="bcc-mono text-cardstock-deep">STANDING BEHIND //</p>
          <h3 className="bcc-stencil mt-1 text-2xl text-ink">
            Your current commitments
          </h3>
          <p className="mt-3 max-w-prose font-serif text-ink-soft">
            Each row is a public commitment to that operator&rsquo;s work.
            Release any that no longer reflects your current assessment to
            make room for a new one. Releasing has no reputation cost &mdash;
            changing your mind is part of staying honest.
          </p>
        </header>

        {holders.length === 0 ? (
          <p className="bcc-mono py-6 text-center text-cardstock-deep">
            No active commitments to show. Try again.
          </p>
        ) : (
          <ul className="flex flex-col">
            {holders.map((holder) => (
              <HolderRow
                key={holder.id}
                holder={holder}
                isReleasing={releasingHolderId === holder.id}
                isRetryingCast={
                  retryingCast && releasingHolderId === holder.id
                }
                disabled={
                  (releasingHolderId !== null && releasingHolderId !== holder.id) ||
                  (retryingCast && releasingHolderId !== holder.id)
                }
                errorText={
                  errorText !== null && releasingHolderId === holder.id
                    ? errorText
                    : null
                }
                onRelease={() => void onRelease(holder.id)}
              />
            ))}
          </ul>
        )}

        {/* Slot context — quiet, factual, not a score. */}
        {slotsTotal > 0 && (
          <p className="bcc-mono mt-5 text-[11px] tracking-[0.14em] text-cardstock-deep">
            STAND BEHIND IS SCARCE &mdash; YOU HAVE {slotsTotal} ACTIVE SLOTS.
          </p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HolderRow — single commitment. Calm row treatment: target identity
// + when + optional note + Release. No badges, no scores, no ranking.
// ─────────────────────────────────────────────────────────────────────

function HolderRow({
  holder,
  isReleasing,
  isRetryingCast,
  disabled,
  errorText,
  onRelease,
}: {
  holder: SlotHolder;
  isReleasing: boolean;
  isRetryingCast: boolean;
  disabled: boolean;
  errorText: string | null;
  onRelease: () => void;
}) {
  const releasing = isReleasing && !isRetryingCast;
  const dimmed = isReleasing || disabled;

  return (
    <li
      className={`flex flex-col gap-1 border-b border-cardstock/15 py-4 last:border-b-0 ${
        dimmed ? "opacity-60" : ""
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            {holder.target_link !== "" ? (
              <a
                href={holder.target_link}
                className="bcc-mono text-cardstock hover:text-phosphor"
              >
                {holder.target_label !== ""
                  ? holder.target_label
                  : "Unnamed target"}
              </a>
            ) : (
              <span className="bcc-mono text-cardstock-deep italic">
                {holder.target_label !== ""
                  ? holder.target_label
                  : "Target unavailable"}
              </span>
            )}
            <span className="bcc-mono text-[11px] tracking-[0.18em] text-cardstock-deep">
              SINCE&nbsp;
              <time dateTime={holder.created_at}>
                {formatRelativeTime(holder.created_at)}
              </time>
            </span>
          </div>
          {holder.context_note !== null && holder.context_note !== "" && (
            <p className="font-serif italic text-cardstock-deep">
              &ldquo;{holder.context_note}&rdquo;
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onRelease}
          disabled={dimmed}
          aria-busy={isReleasing || isRetryingCast}
          aria-disabled={dimmed}
          className="bcc-mono shrink-0 border border-cardstock/30 px-3 py-1 text-[11px] tracking-[0.18em] text-cardstock-deep transition hover:bg-cardstock-deep/10 hover:text-cardstock disabled:cursor-not-allowed"
        >
          {isRetryingCast
            ? "ADDING…"
            : releasing
              ? "RELEASING…"
              : "RELEASE"}
        </button>
      </div>
      {errorText !== null && (
        <p role="alert" className="bcc-mono mt-1 text-[11px] text-safety">
          {errorText}
        </p>
      )}
    </li>
  );
}

/**
 * Branch on err.code (§γ error-contract rule). The picker only
 * surfaces release-side failures + retry-cast failures; tier-gate
 * errors can't fire inside this flow (the operator already cast
 * once to reach the bandwidth-exhausted state, so eligibility
 * hasn't changed).
 */
function humanizeReleaseError(err: BccApiError): string {
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in again.",
      bcc_rate_limited: "Too many actions just now. Wait a moment.",
      bcc_not_found: "That commitment is no longer on file.",
      bcc_forbidden: "Only your own commitments can be released here.",
      bcc_attestation_revoked: "That one was already released.",
      bcc_invalid_request: "We couldn’t complete that release.",
      bcc_attestation_bandwidth_exhausted:
        "Still at the limit. Pick a different commitment to release.",
    },
    "Couldn’t release that one. Try again.",
  );
}
