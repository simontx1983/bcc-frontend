"use client";

/**
 * OnboardingTrustLayerSteps — the Trust Attestation Layer teaching per
 * constitution §J.7 + Phase 1 plan §8.2.
 *
 * Copy is LOCKED in the constitution and matches verbatim. Any change to
 * the wording must amend `docs/trust-attestation-layer.md` §J.7 and
 * `docs/trust-attestation-phase-1-plan.md` §8.2 first. This redesign
 * changed only the PRESENTATION — the four locked cards are re-laid-out
 * as TWO screens on the `bcc-onb-*` page-chrome namespace:
 *
 *   Screen A — "What this is" (product framing) + "Three things you can
 *              do" (Vouch / Back · 0 OF 5 / Dispute primitives).
 *   Screen B — "How reputation works" (LOAD-BEARING per risk-assessment
 *              §2.9 — the "absence is not a negative signal" teaching, the
 *              primary mitigation against "no vouch = bad" drift) + the
 *              live `<ReputationDemo />` (see reputation-demo/). The
 *              teaching text sits beside the demo author card, the two
 *              columns vertically centered against each other (they
 *              can't be forced to equal heights — content-driven prose
 *              vs. a fixed card); the demo post card runs full-width
 *              underneath. The whole screen — headline, demo, footer —
 *              shares one 680px cap (the post card's width) rather than
 *              the wizard's full 1080px wrap.
 *
 * The absence-not-negative + reputation/reliability strings are imported
 * from `lib/copy/trust-layer.ts` so they render verbatim across every
 * surface (onboarding, /me/reliability, future).
 *
 * The demo's own Vouch button no longer advances the wizard (it used to,
 * as a Phase 1 stopgap) — it's a real, re-clickable "try it" moment now
 * (fires a bloom, not a mutation), decoupled from wizard progress. The
 * footer's Continue button is the only way forward on this screen.
 */

import { STEP_LABEL } from "@/components/onboarding/OnboardingWizard";
import { ReputationDemo } from "@/components/onboarding/reputation-demo/ReputationDemo";
import {
  ABSENCE_NOT_NEGATIVE,
  REPUTATION_VS_RELIABILITY,
} from "@/lib/copy/trust-layer";

type Screen = 1 | 2;

interface OnboardingTrustLayerStepsProps {
  onBack: () => void;
  onDone: () => void;
  /**
   * Which of this step's TWO inner screens to show (1 or 2).
   *
   * CONTROLLED, deliberately. This used to hold the screen in local state,
   * which had two consequences: the wizard's rail said "Step 3 of 6" on
   * both screens (so Continue looked like it had done nothing and the bar
   * stalled), and history knew about one screen where the visitor saw two —
   * browser Back from "How reputation works." skipped past "What this is."
   * to the identity step. Hoisting it lets the wizard own both the readout
   * and the history entry.
   */
  screen?: number;
  /** Request a move to another inner screen. The wizard turns this into a
   *  history entry, exactly as it does for a top-level step. */
  onScreenChange?: (index: number) => void;
}

export function OnboardingTrustLayerSteps({
  onBack,
  onDone,
  screen = 1,
  onScreenChange,
}: OnboardingTrustLayerStepsProps) {
  const idx: Screen = screen === 2 ? 2 : 1;

  return (
    <section className="bcc-onb-step">
      <p className="bcc-onb-eyebrow">{STEP_LABEL.trust} · {idx} of 2</p>

      {idx === 1 ? (
        <PrimerScreen onBack={onBack} onContinue={() => onScreenChange?.(2)} />
      ) : (
        <ReputationScreen onBack={() => onScreenChange?.(1)} onContinue={onDone} />
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Screen A — "What this is." + "Three things you can do."
// ─────────────────────────────────────────────────────────────────────

function PrimerScreen({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  return (
    <>
      <h1 className="bcc-onb-disp">What this is.</h1>
      <p className="bcc-onb-lede">
        Blue Collar Crypto is an operator intelligence network. Operators back,
        dispute, or stay silent about other operators. The platform synthesizes
        those signals into a reputation graph counter-parties consult before
        trusting someone with capital, code, or governance.
      </p>

      <div className="bcc-onb-panel" style={{ marginTop: "clamp(24px, 4vw, 40px)" }}>
        <p className="bcc-onb-field-label" style={{ marginBottom: "18px" }}>
          Three things you can do
        </p>
        <div className="bcc-onb-prim">
          <div className="k">VOUCH</div>
          <p className="q">&ldquo;I think this operator is competent.&rdquo;</p>
          {/* "back" was the generic verb here until contract v1.56 made it
              the scarce primitive's name — reworded so Card 2 doesn't
              describe Vouch using the other action's label (§J.7). */}
          <p className="d">Abundant — vouch for as many as you want.</p>
        </div>
        <div className="bcc-onb-prim">
          <div className="k">BACK · 0 OF 5</div>
          <p className="q">&ldquo;I&rsquo;m putting my reputation on this operator&rsquo;s work.&rdquo;</p>
          <p className="d">Scarce. You only have a few high-conviction slots; spend them deliberately.</p>
        </div>
        <div className="bcc-onb-prim">
          <div className="k">DISPUTE</div>
          <p className="q">&ldquo;This needs panel review.&rdquo;</p>
          <p className="d">Formal. Requires evidence and panel adjudication.</p>
        </div>
      </div>

      <footer className="bcc-onb-foot">
        <button type="button" className="bcc-onb-link" onClick={onBack}>← Back</button>
        <button type="button" className="bcc-onb-btn bcc-onb-btn-primary" onClick={onContinue}>
          Continue
        </button>
      </footer>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Screen B — "How reputation works." (load-bearing §2.9) + the live demo.
// ─────────────────────────────────────────────────────────────────────

function ReputationScreen({ onBack, onContinue }: { onBack: () => void; onContinue: () => void }) {
  // Capped at 680px — matches the demo's post card, so the description,
  // the demo, and the footer all read as one consistently-wide block
  // instead of each picking its own width against the wizard's full
  // 1080px `.bcc-onb-wrap`.
  return (
    <div style={{ maxWidth: "680px" }}>
      <h1 className="bcc-onb-disp">How reputation works.</h1>

      <div style={{ marginTop: "clamp(24px, 4vw, 40px)" }}>
        <ReputationDemo
          description={
            <>
              <p className="bcc-onb-lede" style={{ margin: 0 }}>
                Your <b>reputation</b> grows from what others say about you. Your{" "}
                <b>reliability</b> grows from your own track record of judging
                others accurately over time.{" "}
                {REPUTATION_VS_RELIABILITY.both_grow_slowly}
              </p>

              {/* Load-bearing per risk-assessment §2.9 — headline + body
                  render together, verbatim from the shared constant. */}
              <p
                className="bcc-onb-lede"
                style={{ margin: "6px 0 0", paddingLeft: "16px", borderLeft: "3px solid var(--bcc-accent)", fontStyle: "italic" }}
              >
                <b style={{ fontStyle: "normal" }}>{ABSENCE_NOT_NEGATIVE.headline}</b>{" "}
                {ABSENCE_NOT_NEGATIVE.body}
              </p>
            </>
          }
        />
      </div>

      <footer className="bcc-onb-foot">
        <button type="button" className="bcc-onb-link" onClick={onBack}>← Back</button>
        <button type="button" className="bcc-onb-btn bcc-onb-btn-primary" onClick={onContinue}>
          Continue →
        </button>
      </footer>
    </div>
  );
}
