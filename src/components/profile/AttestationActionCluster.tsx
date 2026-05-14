"use client";

/**
 * AttestationActionCluster — the four primary Layer-1 actions per
 * §J.6: Vouch / Stand Behind / Dispute / Report. The load-bearing
 * interaction surface for the Trust Attestation Layer.
 *
 * Slice C status: Vouch + Stand Behind buttons wired to the §4.20
 * §J mutation endpoints. Each button toggles between cast / revoke
 * based on `viewer_attestation`. Dispute + Report remain scaffold —
 * Dispute Phase 1.5; Report wires to the existing content-report
 * surface in a future slice.
 *
 * Anti-complexity heuristics (§J.7) — enforced:
 *   - #4: one action per primitive. No settings panel. No
 *     overloaded buttons.
 *   - #5: show what's scarce, hide what's abundant. Vouch has no
 *     counter. Stand Behind always shows allocation when known.
 *   - #7: negative signals visible BUT calibrated. Disabled states
 *     surface the unlock path as an inline subtitle, not a tooltip.
 *   - #8: the action label IS the explanation. The cluster does NOT
 *     add subtitles, hover copy, or onboarding hints — those would
 *     violate the heuristic. The only secondary copy is the inline
 *     unlock_hint on disabled buttons.
 *
 * §N7 visibility rule: every gated action renders disabled with
 * inline unlock_hint UNLESS it's structurally impossible
 * (`allowed: false, unlock_hint: null`), in which case it's hidden.
 *
 * §J.4.1 synthesis invisibility: no math surfaces. The Stand Behind
 * allocation indicator ("2 OF 5") is intentional-scarcity surfacing
 * per heuristic #5 — not synthesis math. No weights, multipliers,
 * decay curves, or caps appear anywhere in the rendered output.
 *
 * Mutation-error handling: per the §γ error-contract rule, the
 * cluster branches on `err.code`, never on `err.message`. The
 * server-authoritative aspirational copy for tier-gate failures
 * arrives in `err.data.unlock_hint` for `bcc_attestation_ineligible`;
 * we render it verbatim (already in the right tone). For everything
 * else we use `humanizeCode` with a small per-code map.
 *
 * Optimistic UI: NOT used. Reasons:
 *   - Cast is idempotent; double-click is structurally safe.
 *   - Revoke is idempotent; toggle UI rolls back cleanly on error
 *     because we never mutate local state until the server confirms.
 *   - The mutation latency is sub-200ms; the pending-state class on
 *     the button is sufficient feedback.
 */

import { useRef, useState } from "react";

import { SlotHoldersPicker } from "@/components/profile/SlotHoldersPicker";
import {
  useCastAttestation,
  useRevokeAttestation,
} from "@/hooks/useAttestations";
import { humanizeCode } from "@/lib/api/errors";
import type {
  AttestationCastRequest,
  AttestationTargetKind,
  BandwidthExhaustedData,
  BccApiError,
  SlotHolder,
  ViewerAttestation,
} from "@/lib/api/types";

/**
 * Structural subset of permission entries compatible with both
 * `CardPermissionEntry` (entity cards) and `MemberPermission`
 * (operator profiles). Both expose `{ allowed, unlock_hint }`; the
 * cluster doesn't need `reason_code` for rendering.
 */
interface ActionPermission {
  allowed: boolean;
  unlock_hint: string | null;
}

export interface AttestationActionClusterProps {
  /**
   * The target this cluster acts on. Required to dispatch the §4.20
   * §J.2 / §J.3 mutations. Optional during Phase 1 rollout — when
   * absent the cluster degrades to read-only (no click handlers
   * attach). Once all parent surfaces ship the prop the optional is
   * dropped.
   */
  targetKind?: AttestationTargetKind | undefined;
  targetId?: number | undefined;
  /**
   * Server-resolved permissions per §J.6 / §N7. Undefined → backend
   * hasn't shipped this gate yet, action is hidden. Defined →
   * renders enabled when allowed, disabled with inline unlock_hint
   * when not. Explicit `| undefined` per the project's
   * `exactOptionalPropertyTypes` tsconfig setting.
   */
  canVouch?: ActionPermission | undefined;
  canStandBehind?: ActionPermission | undefined;
  canDispute?: ActionPermission | undefined;
  canReport?: ActionPermission | undefined;
  /**
   * Has the viewer already cast an attestation on this target?
   * Drives the cast-state copy ("VOUCHED" / "STANDING BEHIND")
   * AND the click-to-revoke branch.
   */
  viewerAttestation?: ViewerAttestation | undefined;
  /**
   * Stand Behind allocation per §J.6: rendered as "N OF M".
   * Optional during Phase 1 rollout; absent → renders plain
   * `STAND BEHIND` without the allocation indicator.
   */
  standBehindSlotsUsed?: number | undefined;
  standBehindSlotsTotal?: number | undefined;
  /**
   * Legacy fallback during the §J.11 "endorse collapses into vouch"
   * migration. When `viewer_attestation.vouch` isn't yet shipped
   * from backend, fall back to this for the cast-state of Vouch.
   * Removed when migration completes.
   */
  viewerHasEndorsed?: boolean | undefined;
}

interface PickerState {
  open: boolean;
  holders: SlotHolder[];
  slotsTotal: number;
  /** The cast request that triggered the bandwidth-exhausted error. */
  pendingCast: AttestationCastRequest | null;
  /** Holder id currently being released (revoke leg, then retry-cast leg). */
  releasingId: number | null;
  /** True during the retry-cast leg after a successful release. */
  retryingCast: boolean;
  /** Latest error in the picker flow (revoke OR retry-cast). */
  pickerError: BccApiError | null;
}

const INITIAL_PICKER: PickerState = {
  open: false,
  holders: [],
  slotsTotal: 0,
  pendingCast: null,
  releasingId: null,
  retryingCast: false,
  pickerError: null,
};

export function AttestationActionCluster(props: AttestationActionClusterProps) {
  const hasVouched =
    props.viewerAttestation?.vouch != null
      ? true
      : props.viewerHasEndorsed ?? false;
  const isStandingBehind = props.viewerAttestation?.stand_behind != null;

  const targetKind = props.targetKind;
  const targetId = props.targetId;
  const canMutate =
    targetKind !== undefined && targetId !== undefined && targetId > 0;

  const [errorText, setErrorText] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerState>(INITIAL_PICKER);

  // Ref-flag the picker-driven release + retry-cast flow so the
  // global mutation onError handlers don't double-handle errors
  // that the picker's try/catch is already surfacing. Read on the
  // same tick as the callback fires; never persists across renders.
  const inPickerFlow = useRef(false);

  const castMutation = useCastAttestation({
    onSuccess: () => {
      if (inPickerFlow.current) {
        // Retry-cast succeeded inside picker — close the dialog
        // quietly. The cluster's own viewer_attestation prop will
        // re-flow via the broad invalidate that useCastAttestation
        // already triggers on `status === "created"`.
        inPickerFlow.current = false;
        setPicker(INITIAL_PICKER);
        setErrorText(null);
        return;
      }
      setErrorText(null);
    },
    onError: (err) => {
      if (inPickerFlow.current) {
        // mutateAsync's catch block in handleReleaseAndRetry handles
        // this — don't double-surface.
        return;
      }
      // Stand Behind hit the §J.1 bandwidth ceiling — open the
      // picker instead of surfacing the raw error inline. The
      // server's slot_holders[] payload feeds the dialog directly.
      const isBandwidthExhausted =
        err.code === "bcc_attestation_bandwidth_exhausted" &&
        castMutation.variables?.kind === "stand_behind";
      if (isBandwidthExhausted) {
        const data = parseBandwidthExhaustedData(err.data);
        const pending = castMutation.variables ?? null;
        if (data !== null && pending !== null) {
          setPicker({
            open: true,
            holders: data.slot_holders,
            slotsTotal: data.slots_total,
            pendingCast: pending,
            releasingId: null,
            retryingCast: false,
            pickerError: null,
          });
          setErrorText(null);
          return;
        }
      }
      setErrorText(humanizeAttestationError(err));
    },
  });
  const revokeMutation = useRevokeAttestation({
    onSuccess: () => {
      if (!inPickerFlow.current) {
        setErrorText(null);
      }
    },
    onError: (err) => {
      if (inPickerFlow.current) {
        return;
      }
      setErrorText(humanizeAttestationError(err));
    },
  });

  const handleReleaseAndRetry = async (holderId: number) => {
    if (picker.pendingCast === null) {
      return;
    }
    const pendingCast = picker.pendingCast;
    setPicker((s) => ({
      ...s,
      releasingId: holderId,
      retryingCast: false,
      pickerError: null,
    }));
    inPickerFlow.current = true;
    try {
      await revokeMutation.mutateAsync(holderId);
    } catch (err) {
      inPickerFlow.current = false;
      setPicker((s) => ({
        ...s,
        releasingId: null,
        pickerError: err as BccApiError,
      }));
      return;
    }
    setPicker((s) => ({ ...s, retryingCast: true }));
    try {
      await castMutation.mutateAsync(pendingCast);
      // castMutation.onSuccess closes the picker.
    } catch (err) {
      inPickerFlow.current = false;
      setPicker((s) => ({
        ...s,
        retryingCast: false,
        pickerError: err as BccApiError,
      }));
    }
  };

  const handleDismissPicker = () => {
    inPickerFlow.current = false;
    setPicker(INITIAL_PICKER);
  };

  const handleVouchClick = () => {
    if (!canMutate || !targetKind || !targetId) return;
    setErrorText(null);
    if (hasVouched && props.viewerAttestation?.vouch?.id != null) {
      revokeMutation.mutate(props.viewerAttestation.vouch.id);
      return;
    }
    castMutation.mutate({
      kind: "vouch",
      target_kind: targetKind,
      target_id: targetId,
    });
  };

  const handleStandBehindClick = () => {
    if (!canMutate || !targetKind || !targetId) return;
    setErrorText(null);
    if (isStandingBehind && props.viewerAttestation?.stand_behind?.id != null) {
      revokeMutation.mutate(props.viewerAttestation.stand_behind.id);
      return;
    }
    castMutation.mutate({
      kind: "stand_behind",
      target_kind: targetKind,
      target_id: targetId,
    });
  };

  // §N7: cluster renders nothing when all permissions are absent.
  // During Phase 1 backend rollout this means the cluster doesn't
  // appear yet — it surfaces as gates ship in Week 2.
  const hasAnyPermission =
    props.canVouch !== undefined ||
    props.canStandBehind !== undefined ||
    props.canDispute !== undefined ||
    props.canReport !== undefined;
  if (!hasAnyPermission) {
    return null;
  }

  // Stand Behind cast pending = vouch button stays interactive (they
  // are independent kinds); same for revoke. Each tracks its own
  // kind by looking at the mutation variables.
  const isVouchPending =
    (castMutation.isPending && castMutation.variables?.kind === "vouch") ||
    (revokeMutation.isPending &&
      revokeMutation.variables === props.viewerAttestation?.vouch?.id);
  const isStandBehindPending =
    (castMutation.isPending &&
      castMutation.variables?.kind === "stand_behind") ||
    (revokeMutation.isPending &&
      revokeMutation.variables ===
        props.viewerAttestation?.stand_behind?.id);

  return (
    <section
      aria-label="Trust attestation actions"
      className="flex flex-col gap-2"
    >
      {props.canVouch !== undefined && (
        <ActionButton
          label={
            isVouchPending
              ? hasVouched
                ? "REVOKING…"
                : "VOUCHING…"
              : hasVouched
                ? "VOUCHED"
                : "VOUCH"
          }
          permission={props.canVouch}
          isCast={hasVouched}
          tone="positive"
          onClick={canMutate ? handleVouchClick : undefined}
          isPending={isVouchPending}
        />
      )}

      {props.canStandBehind !== undefined && (
        <ActionButton
          label={
            isStandBehindPending
              ? isStandingBehind
                ? "REVOKING…"
                : "STANDING BEHIND…"
              : isStandingBehind
                ? "STANDING BEHIND"
                : formatStandBehindLabel(
                    props.standBehindSlotsUsed,
                    props.standBehindSlotsTotal,
                  )
          }
          permission={props.canStandBehind}
          isCast={isStandingBehind}
          tone="conviction"
          onClick={canMutate ? handleStandBehindClick : undefined}
          isPending={isStandBehindPending}
        />
      )}

      {props.canDispute !== undefined && (
        <ActionButton
          label="DISPUTE"
          permission={props.canDispute}
          isCast={false}
          tone="adversarial"
          isPending={false}
        />
      )}

      {props.canReport !== undefined && (
        <ActionButton
          label="REPORT"
          permission={props.canReport}
          isCast={false}
          tone="utility"
          isPending={false}
        />
      )}

      {errorText !== null && (
        <p
          role="alert"
          className="bcc-mono pl-1 text-[11px] tracking-[0.14em] text-safety"
        >
          {errorText}
        </p>
      )}

      <SlotHoldersPicker
        open={picker.open}
        holders={picker.holders}
        slotsTotal={picker.slotsTotal}
        releasingHolderId={picker.releasingId}
        retryingCast={picker.retryingCast}
        error={picker.pickerError}
        onRelease={handleReleaseAndRetry}
        onDismiss={handleDismissPicker}
      />
    </section>
  );
}

/**
 * Defensive runtime narrowing for the §J.2
 * `bcc_attestation_bandwidth_exhausted` `error.data` payload.
 * The contract guarantees the shape, but typed error envelopes
 * carry `Record<string, unknown> | null` — we validate the
 * minimum we need (slot_holders array + slot counts) before
 * trusting it. Returns null when the shape is wrong; the cluster
 * falls back to the inline error path in that case.
 */
function parseBandwidthExhaustedData(
  data: Record<string, unknown> | null,
): BandwidthExhaustedData | null {
  if (data === null || typeof data !== "object") {
    return null;
  }
  const holdersRaw = data["slot_holders"];
  if (!Array.isArray(holdersRaw)) {
    return null;
  }
  const slotsTotal = typeof data["slots_total"] === "number"
    ? data["slots_total"]
    : 0;
  const slotsUsed = typeof data["slots_used"] === "number"
    ? data["slots_used"]
    : 0;
  return {
    slot_holders: holdersRaw as SlotHolder[],
    slots_total: slotsTotal,
    slots_used: slotsUsed,
  };
}

/**
 * Stand Behind label formatting. Phillip's note: scarcity should
 * feel "intentional, valuable, thoughtful — not gamified or
 * resource-meter-like." "N OF M" reads as deliberate allocation
 * rather than a numeric ratio meter.
 */
function formatStandBehindLabel(
  slotsUsed: number | undefined,
  slotsTotal: number | undefined,
): string {
  if (slotsUsed === undefined || slotsTotal === undefined) {
    return "STAND BEHIND";
  }
  return `STAND BEHIND · ${slotsUsed} OF ${slotsTotal}`;
}

type ActionTone = "positive" | "conviction" | "adversarial" | "utility";

function ActionButton({
  label,
  permission,
  isCast,
  tone,
  onClick,
  isPending,
}: {
  label: string;
  permission: ActionPermission;
  isCast: boolean;
  tone: ActionTone;
  onClick?: (() => void) | undefined;
  isPending: boolean;
}) {
  // §N7 structural-deny: allowed=false AND unlock_hint=null →
  // hidden, not rendered as disabled. Covers self-attest etc.
  const isStructuralDeny =
    !permission.allowed && permission.unlock_hint === null;
  if (isStructuralDeny) {
    return null;
  }

  const isEnabled = permission.allowed && onClick !== undefined && !isPending;
  const className = buttonClassFor(tone, isCast, !isEnabled);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={!isEnabled}
        aria-disabled={!isEnabled}
        aria-busy={isPending}
        onClick={onClick}
        className={className}
      >
        {label}
      </button>
      {!permission.allowed && permission.unlock_hint !== null && (
        <p className="bcc-mono pl-1 text-[11px] tracking-[0.14em] text-cardstock-deep">
          {permission.unlock_hint}
        </p>
      )}
    </div>
  );
}

const BASE_BUTTON_CLASS =
  "bcc-mono inline-flex items-center justify-center self-start px-4 py-2 text-sm tracking-[0.18em] transition disabled:cursor-not-allowed";

function buttonClassFor(
  tone: ActionTone,
  isCast: boolean,
  isDisabled: boolean,
): string {
  if (isDisabled) {
    // Disabled state reads as quiet, not exclusionary. The
    // unlock_hint below the button carries the path forward.
    return `${BASE_BUTTON_CLASS} border border-cardstock/20 text-cardstock-deep/60`;
  }
  if (isCast) {
    // Already cast — action remains enabled (the click revokes).
    // Phosphor tint signals completion.
    return `${BASE_BUTTON_CLASS} border border-phosphor/60 bg-phosphor/10 text-phosphor hover:bg-phosphor/15`;
  }
  switch (tone) {
    case "conviction":
      // Stand Behind — strongest visual weight per heuristic #5, BUT
      // (Sprint 4 cohesion subtraction) without the safety-orange
      // tint. The crypto-native subconscious-reading audit flagged
      // safety-orange + "N OF M" allocation as pattern-matching to
      // staking / locked-capital UX. The intentional-scarcity
      // surfacing stays via the N OF M label; the financial visual
      // is what was screaming. Phosphor border = "live, deliberate"
      // commitment without the capital-allocation read.
      return `${BASE_BUTTON_CLASS} border border-phosphor/70 bg-cardstock-deep/5 text-ink hover:bg-cardstock-deep/15`;
    case "adversarial":
      // Dispute — visibly distinct from positive actions. Quieter
      // than conviction but still readable. This is an adversarial
      // commit, not a quick gesture.
      return `${BASE_BUTTON_CLASS} border border-cardstock/50 text-cardstock hover:bg-cardstock/10`;
    case "utility":
      // Report — least prominent. Functional moderation surface,
      // not a primary trust signal.
      return `${BASE_BUTTON_CLASS} border border-cardstock/30 text-cardstock-deep hover:bg-cardstock-deep/10`;
    case "positive":
    default:
      // Vouch — primary positive action. Always available to
      // eligible viewers.
      return `${BASE_BUTTON_CLASS} border border-cardstock/40 bg-cardstock/5 text-cardstock hover:bg-cardstock/15`;
  }
}

/**
 * Branch on error.code per the §γ error-contract rule. For the tier-
 * gate error, the server supplies the aspirational unlock_hint
 * verbatim in error.data.unlock_hint — emit it instead of the
 * code-map fallback so the FE stays single-source-of-truth for tone.
 */
function humanizeAttestationError(err: BccApiError): string {
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
      bcc_unauthorized: "Sign in to attest.",
      bcc_rate_limited: "Too many actions just now. Wait a moment.",
      bcc_invalid_request: "We couldn't record that attestation.",
      bcc_attestation_self: "You can't attest on yourself.",
      bcc_attestation_bandwidth_exhausted:
        "You're at your Stand Behind limit. Revoke one to free a slot.",
      bcc_attestation_fraud_blocked:
        "Your account is temporarily restricted from attesting.",
      bcc_attestation_revoked:
        "That attestation was already revoked.",
      bcc_not_found: "Attestation not found.",
      bcc_forbidden: "You can only act on your own attestations.",
    },
    "Couldn't update attestation. Try again.",
  );
}
