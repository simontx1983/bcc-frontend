"use client";

/**
 * AttestationActionCluster — the four primary Layer-1 actions per
 * §J.6: Vouch / Stand Behind / Dispute / Report. The load-bearing
 * interaction surface for the Trust Attestation Layer.
 *
 * Phase 1 status: READ-ONLY scaffold. `onClick` handlers are no-ops
 * pending the §J.2 / §J.3 POST endpoints landing in Phase 1 Week 2
 * per the implementation plan. The cluster validates semantics,
 * eligibility-gate rendering, and emotional readability before
 * mutation wiring exists.
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
 * Phase 1 backend rollout: when a permission entry is undefined
 * entirely (backend hasn't shipped the gate yet), the action is
 * hidden. As permissions ship in Phase 1 Week 2, the buttons appear.
 *
 * §J.4.1 synthesis invisibility: no math surfaces. The Stand Behind
 * allocation indicator ("2 OF 5") is intentional-scarcity surfacing
 * per heuristic #5 — not synthesis math. No weights, multipliers,
 * decay curves, or caps appear anywhere in the rendered output.
 *
 * Disabled-state emotional tone (Phillip's note: scarcity +
 * eligibility should feel aspirational, not exclusionary):
 *   - unlock_hint copy comes from the server per §A2. FE renders it
 *     inline below the disabled button — visible path forward, not
 *     hidden behind a tooltip.
 *   - For scarcity-exhausted Stand Behind: server hint reads as an
 *     invitation to choose ("All slots in use. Drop one to add
 *     this."), not a rejection.
 *   - For tier-gated Dispute: server hint is aspirational ("Reach
 *     Trusted tier to file disputes."), not stigma.
 */

import type { ViewerAttestation } from "@/lib/api/types";

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
   * Drives the cast-state copy ("VOUCHED" / "STANDING BEHIND").
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

export function AttestationActionCluster(props: AttestationActionClusterProps) {
  const hasVouched =
    props.viewerAttestation?.vouch != null
      ? true
      : props.viewerHasEndorsed ?? false;
  const isStandingBehind = props.viewerAttestation?.stand_behind != null;

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

  return (
    <section
      aria-label="Trust attestation actions"
      className="flex flex-col gap-2"
    >
      {props.canVouch !== undefined && (
        <ActionButton
          label={hasVouched ? "VOUCHED" : "VOUCH"}
          permission={props.canVouch}
          isCast={hasVouched}
          tone="positive"
        />
      )}

      {props.canStandBehind !== undefined && (
        <ActionButton
          label={
            isStandingBehind
              ? "STANDING BEHIND"
              : formatStandBehindLabel(
                  props.standBehindSlotsUsed,
                  props.standBehindSlotsTotal,
                )
          }
          permission={props.canStandBehind}
          isCast={isStandingBehind}
          tone="conviction"
        />
      )}

      {props.canDispute !== undefined && (
        <ActionButton
          label="DISPUTE"
          permission={props.canDispute}
          isCast={false}
          tone="adversarial"
        />
      )}

      {props.canReport !== undefined && (
        <ActionButton
          label="REPORT"
          permission={props.canReport}
          isCast={false}
          tone="utility"
        />
      )}
    </section>
  );
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
}: {
  label: string;
  permission: ActionPermission;
  isCast: boolean;
  tone: ActionTone;
}) {
  // §N7 structural-deny: allowed=false AND unlock_hint=null →
  // hidden, not rendered as disabled. Covers self-attest etc.
  const isStructuralDeny =
    !permission.allowed && permission.unlock_hint === null;
  if (isStructuralDeny) {
    return null;
  }

  const isEnabled = permission.allowed;
  const className = buttonClassFor(tone, isCast, !isEnabled);

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={!isEnabled}
        onClick={() => {
          /* Read-only scaffold — mutation wiring lands Phase 1 Week 2.
             The cluster validates semantics + emotional tone first. */
        }}
        className={className}
      >
        {label}
      </button>
      {!isEnabled && permission.unlock_hint !== null && (
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
    // Already cast — action remains enabled (the click would revoke
    // when mutation wiring lands) but visually reads "done, in good
    // order." Phosphor tint signals completion.
    return `${BASE_BUTTON_CLASS} border border-phosphor/60 bg-phosphor/10 text-phosphor hover:bg-phosphor/15`;
  }
  switch (tone) {
    case "conviction":
      // Stand Behind — strongest visual weight per heuristic #5.
      // Safety-orange-tinted to signal "high-cost, intentional."
      // Scarcity is valuable, thoughtful — not gamified.
      return `${BASE_BUTTON_CLASS} border border-safety bg-safety/10 text-safety hover:bg-safety/20`;
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
