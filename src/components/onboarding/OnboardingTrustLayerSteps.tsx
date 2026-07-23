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
 *              do" (Vouch / Stand Behind · 0 OF 5 / Dispute primitives).
 *   Screen B — "How reputation works" (LOAD-BEARING per risk-assessment
 *              §2.9 — the "absence is not a negative signal" teaching, the
 *              primary mitigation against "no vouch = bad" drift) + the
 *              live `<ReputationDemo />` (see reputation-demo/).
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

import { useState } from "react";

import { ReputationDemo } from "@/components/onboarding/reputation-demo/ReputationDemo";
import {
  ABSENCE_NOT_NEGATIVE,
  REPUTATION_VS_RELIABILITY,
} from "@/lib/copy/trust-layer";

type Screen = "primer" | "reputation";

interface OnboardingTrustLayerStepsProps {
  onBack: () => void;
  onDone: () => void;
}

export function OnboardingTrustLayerSteps({
  onBack,
  onDone,
}: OnboardingTrustLayerStepsProps) {
  const [screen, setScreen] = useState<Screen>("primer");
  const idx = screen === "primer" ? 1 : 2;

  return (
    <section className="bcc-onb-step">
      <p className="bcc-onb-eyebrow">How the graph works · {idx} of 2</p>

      {screen === "primer" ? (
        <PrimerScreen onBack={onBack} onContinue={() => setScreen("reputation")} />
      ) : (
        <ReputationScreen onBack={() => setScreen("primer")} onContinue={onDone} />
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
          <p className="d">Abundant — back as many as you want.</p>
        </div>
        <div className="bcc-onb-prim">
          <div className="k">STAND BEHIND · 0 OF 5</div>
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
  return (
    <>
      <h1 className="bcc-onb-disp">How reputation works.</h1>

      <div style={{ marginTop: "clamp(20px, 3vw, 32px)", display: "flex", flexDirection: "column", gap: "18px", maxWidth: "56ch" }}>
        <p className="bcc-onb-lede" style={{ margin: 0 }}>
          Your <b>reputation</b> grows from what others say about you.
        </p>
        <p className="bcc-onb-lede" style={{ margin: 0 }}>
          Your <b>reliability</b> is your own track record as a judge of others.
        </p>
        <p className="bcc-onb-lede" style={{ margin: 0 }}>
          {REPUTATION_VS_RELIABILITY.both_grow_slowly}
        </p>

        {/* Load-bearing per risk-assessment §2.9 — headline + body render
            together, verbatim from the shared constant. */}
        <p
          className="bcc-onb-lede"
          style={{ margin: "6px 0 0", paddingLeft: "16px", borderLeft: "3px solid var(--bcc-accent)", fontStyle: "italic" }}
        >
          <b style={{ fontStyle: "normal" }}>{ABSENCE_NOT_NEGATIVE.headline}</b>{" "}
          {ABSENCE_NOT_NEGATIVE.body}
        </p>
      </div>

      <div style={{ marginTop: "clamp(24px, 4vw, 40px)" }}>
        <p className="bcc-onb-field-label" style={{ marginBottom: "14px" }}>
          See it in action
        </p>
        <ReputationDemo />
      </div>

      <footer className="bcc-onb-foot">
        <button type="button" className="bcc-onb-link" onClick={onBack}>← Back</button>
        <button type="button" className="bcc-onb-btn bcc-onb-btn-primary" onClick={onContinue}>
          Continue →
        </button>
      </footer>
    </>
  );
}
