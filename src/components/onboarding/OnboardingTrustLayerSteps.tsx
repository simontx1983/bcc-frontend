"use client";

/**
 * OnboardingTrustLayerSteps — the four-card Trust Attestation Layer
 * onboarding flow per constitution §J.7 + Phase 1 plan §8.2.
 *
 * Copy is LOCKED in the constitution and matches verbatim. Any
 * change to the wording must amend `docs/trust-attestation-layer.md`
 * §J.7 and `docs/trust-attestation-phase-1-plan.md` §8.2 first.
 *
 * The cards land within the existing OnboardingWizard as a single
 * wizard step ("trust") that contains a 4-card sequence:
 *
 *   1. "What this is."          — single-sentence product framing
 *   2. "Three things you can do."  — Vouch / Stand Behind / Dispute
 *                                    primitives with scarcity badge
 *                                    on Stand Behind
 *   3. "How reputation works."  — LOAD-BEARING per risk-assessment
 *                                    §2.9. Contains the "absence is
 *                                    not a negative signal" teaching
 *                                    — the primary mitigation for
 *                                    the "no vouch = bad" cultural
 *                                    drift, the most likely path to
 *                                    existential cultural failure.
 *   4. "Cast your first vouch." — sample-card walkthrough. The
 *                                    feeling of the action is the
 *                                    lesson; clicking the sample
 *                                    VOUCH proceeds to the dopamine
 *                                    step.
 *
 * Emotional calibration (per Phillip's onboarding guidance):
 *   - calm, human, observational, grounded
 *   - NOT manifesto-heavy, hyper-crypto, prestige-oriented,
 *     "future of trust" marketing
 *
 * Phase 1 status: the sample-vouch on Card 4 is a UX walkthrough,
 * not a real mutation. The §J.2 POST endpoints ship in Week 2; this
 * step ships before that and demonstrates the action shape. Clicking
 * the sample VOUCH advances the wizard — no real graph mutation.
 *
 * Constitutional alignment:
 *   - §A2 server-renders-everything is N/A here — onboarding copy
 *     is locked at the doc level, not server-side. The lock is the
 *     constitution itself; this file matches it verbatim.
 *   - §J.4.1 synthesis invisibility: no math, no weights, no
 *     synthesis-mechanic copy. The sample card uses stylized
 *     placeholders, no numeric reputation scores or reliability
 *     scores leak to the user.
 *   - §J.3.2 asymmetric display: no negative-state copy anywhere.
 *     The flow is calm and observational, not evaluative.
 *   - §J.7 heuristics: the cards demonstrate the action vocabulary
 *     ("VOUCH", "STAND BEHIND · N OF M") so the user learns the
 *     labels here, then meets them in the product surfaces.
 */

import { useState } from "react";

type TrustCard = "what" | "actions" | "reputation" | "first_vouch";

interface OnboardingTrustLayerStepsProps {
  onBack: () => void;
  onDone: () => void;
}

export function OnboardingTrustLayerSteps({
  onBack,
  onDone,
}: OnboardingTrustLayerStepsProps) {
  const [card, setCard] = useState<TrustCard>("what");

  const next = (target: TrustCard) => () => setCard(target);
  const goBack = (target: TrustCard) => () => setCard(target);

  return (
    <section className="mx-auto max-w-3xl px-6 pt-12 pb-12 sm:px-8">
      <CardProgress current={card} />

      {card === "what" && <CardOne onContinue={next("actions")} />}

      {card === "actions" && (
        <CardTwo onBack={goBack("what")} onContinue={next("reputation")} />
      )}

      {card === "reputation" && (
        <CardThree onBack={goBack("actions")} onContinue={next("first_vouch")} />
      )}

      {card === "first_vouch" && (
        <CardFour onBack={goBack("reputation")} onContinue={onDone} />
      )}

      {/* Wizard-level Back surfaces on Card 1; subsequent cards use
          their own Back to return to the prior trust-card. */}
      {card === "what" && (
        <div className="mt-10 flex">
          <button
            type="button"
            onClick={onBack}
            className="bcc-mono text-cardstock-deep underline-offset-4 hover:underline"
          >
            ← Back to pulls
          </button>
        </div>
      )}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Progress indicator — small, observational. Not a gamified meter.
// ─────────────────────────────────────────────────────────────────────

function CardProgress({ current }: { current: TrustCard }) {
  const cards: TrustCard[] = ["what", "actions", "reputation", "first_vouch"];
  const idx = cards.indexOf(current) + 1;
  return (
    <p className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
      HOW THE GRAPH WORKS · {idx} OF {cards.length}
    </p>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Card 1 — "What this is."
// One sentence product framing. Single illustrative visual: a small
// stylized reputation summary with a 2-row attestation roster. The
// visual teaches what "the card is the entity" looks like.
// ─────────────────────────────────────────────────────────────────────

function CardOne({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="bcc-stencil text-cardstock text-4xl md:text-5xl">
          What this is.
        </h1>
        <p className="font-serif text-cardstock-deep text-lg leading-relaxed">
          Blue Collar Crypto is an operator intelligence network.
          Operators back, dispute, or stay silent about other
          operators. The platform synthesizes those signals into a
          reputation graph counter-parties consult before trusting
          someone with capital, code, or governance.
        </p>
      </header>

      <SampleReputationCard />

      <footer className="flex justify-end">
        <ContinueButton onClick={onContinue} />
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Card 2 — "Three things you can do."
// The three primitives. Stand Behind shows the scarcity indicator
// (· 0 OF 5) so the user learns the action vocabulary they'll see
// on real cards.
// ─────────────────────────────────────────────────────────────────────

function CardTwo({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="bcc-stencil text-cardstock text-4xl md:text-5xl">
          Three things you can do.
        </h1>
        <p className="font-serif text-cardstock-deep text-lg leading-relaxed">
          Three actions. Each has different cost, different weight,
          different meaning.
        </p>
      </header>

      <ul className="flex flex-col gap-4">
        <PrimitiveRow
          label="VOUCH"
          tagline={`“I think this operator is competent.”`}
          body="Abundant — back as many as you want."
        />
        <PrimitiveRow
          label="STAND BEHIND · 0 OF 5"
          tagline={`“I’m putting my reputation on this operator’s work.”`}
          body="Scarce. You only have a few high-conviction slots; spend them deliberately."
        />
        <PrimitiveRow
          label="DISPUTE"
          tagline={`“This needs panel review.”`}
          body="Formal. Requires evidence and panel adjudication."
        />
      </ul>

      <footer className="flex items-center justify-between">
        <BackButton onClick={onBack} />
        <ContinueButton onClick={onContinue} />
      </footer>
    </div>
  );
}

function PrimitiveRow({
  label,
  tagline,
  body,
}: {
  label: string;
  tagline: string;
  body: string;
}) {
  return (
    <li className="flex flex-col gap-1 border-l-[3px] border-cardstock-edge/40 pl-4">
      <span className="bcc-mono text-cardstock">{label}</span>
      <span className="font-serif italic text-cardstock-deep">{tagline}</span>
      <span className="font-serif text-cardstock-deep">{body}</span>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Card 3 — "How reputation works."
// LOAD-BEARING per risk-assessment §2.9. The "absence of attestation
// is not a negative signal" teaching MUST ship verbatim — it is the
// primary mitigation against the "no vouch = bad" interpretation
// drift, the most likely path to existential cultural failure.
// ─────────────────────────────────────────────────────────────────────

function CardThree({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="bcc-stencil text-cardstock text-4xl md:text-5xl">
          How reputation works.
        </h1>
      </header>

      <div className="flex flex-col gap-5 font-serif text-cardstock-deep text-lg leading-relaxed">
        <p>
          Your <span className="font-semibold text-cardstock">reputation</span>{" "}
          grows from what others say about you.
        </p>
        <p>
          Your <span className="font-semibold text-cardstock">reliability</span>{" "}
          is your own track record as a judge of others.
        </p>
        <p>Both grow slowly. Both are durable.</p>

        {/* This block is load-bearing per risk-assessment §2.9. The
            exact wording is the primary mitigation against "no
            vouch = bad" interpretation drift. Softening, rephrasing,
            or breaking up the sentence reopens the failure mode. */}
        <p className="border-l-[3px] border-safety/60 pl-4 italic">
          <span className="not-italic font-semibold text-cardstock">
            Absence of attestation is not a negative signal.
          </span>{" "}
          Most operators are silent — that&apos;s normal and acceptable.
          The graph doesn&apos;t expect you to attest on any schedule.
          Cast attestations only when you have genuine judgment to
          offer.
        </p>
      </div>

      <footer className="flex items-center justify-between">
        <BackButton onClick={onBack} />
        <ContinueButton onClick={onContinue} />
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Card 4 — "Cast your first vouch."
// Sample-card walkthrough. The feeling of the action is the lesson.
// Phase 1 scaffold: the sample VOUCH is not a real mutation; clicking
// it advances the wizard. When mutation wiring lands in Phase 1
// Week 2, the click becomes a real first attestation.
// ─────────────────────────────────────────────────────────────────────

function CardFour({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="bcc-stencil text-cardstock text-4xl md:text-5xl">
          Cast your first vouch.
        </h1>
        <p className="font-serif text-cardstock-deep text-lg leading-relaxed">
          Here&apos;s a sample operator. Tap{" "}
          <span className="bcc-mono text-cardstock">VOUCH</span> below
          to try the action — the feeling is the lesson.
        </p>
      </header>

      <SampleVouchTarget onVouch={onContinue} />

      <footer className="flex items-center justify-between">
        <BackButton onClick={onBack} />
        <button
          type="button"
          onClick={onContinue}
          className="bcc-mono text-cardstock-deep underline-offset-4 hover:underline"
        >
          Skip — I&apos;ll vouch later
        </button>
      </footer>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sample reputation card for Card 1 — a stylized illustration of
// what an operator's reputation surface looks like. No real data;
// designed to teach the surface, not introduce specific operators.
// Synthesis invisibility preserved: no numeric reliability scores or
// weight values appear; only the locked vocabulary (reputation
// score + reliability standing + attestor rows).
// ─────────────────────────────────────────────────────────────────────

function SampleReputationCard() {
  return (
    <div
      aria-hidden
      className="border border-cardstock/20 bg-cardstock-deep/40 p-5"
    >
      <div className="flex flex-col gap-1">
        <span className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep">
          REPUTATION
        </span>
        <div className="flex items-baseline gap-3">
          <span
            className="bcc-stencil text-cardstock leading-none"
            style={{ fontSize: "clamp(1.75rem, 3vw, 2.25rem)" }}
          >
            72
          </span>
          <span className="bcc-mono text-cardstock-deep">Well Regarded</span>
        </div>
      </div>

      <div className="mt-4 flex flex-col">
        <span className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep">
          BACKING
        </span>
        <ul className="mt-2 flex flex-col gap-2">
          <SampleAttestorRow
            handle="marcus"
            displayName="Marcus"
            kind="STOOD BEHIND"
            relativeTime="3 weeks ago"
            standing="HIGHLY RELIABLE"
          />
          <SampleAttestorRow
            handle="aera"
            displayName="Aera"
            kind="VOUCHED"
            relativeTime="2 months ago"
            standing="CONSISTENT"
          />
        </ul>
      </div>
    </div>
  );
}

function SampleAttestorRow({
  handle,
  displayName,
  kind,
  relativeTime,
  standing,
}: {
  handle: string;
  displayName: string;
  kind: string;
  relativeTime: string;
  standing: string;
}) {
  return (
    <li className="flex items-start gap-3 border-b border-cardstock/15 py-2 last:border-b-0">
      <span
        aria-hidden
        className="bcc-stencil flex h-8 w-8 shrink-0 items-center justify-center border border-cardstock/30 bg-cardstock-deep/60 text-sm text-cardstock"
      >
        {handle.charAt(0).toUpperCase()}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="bcc-mono text-cardstock">@{handle}</span>
          <span className="font-serif text-cardstock-deep">{displayName}</span>
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-phosphor">
            {standing}
          </span>
        </div>
        <div className="bcc-mono text-[11px] text-cardstock-deep">
          {kind} · {relativeTime}
        </div>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sample vouch target for Card 4 — a placeholder operator the user
// can practice the Vouch action against. The click advances the
// wizard; no graph mutation fires in Phase 1 scaffold.
// ─────────────────────────────────────────────────────────────────────

function SampleVouchTarget({ onVouch }: { onVouch: () => void }) {
  return (
    <div className="border border-cardstock/20 bg-cardstock-deep/40 p-5">
      <div className="flex items-start gap-4">
        <span
          aria-hidden
          className="bcc-stencil flex h-14 w-14 shrink-0 items-center justify-center border border-cardstock/30 bg-cardstock-deep/60 text-xl text-cardstock"
        >
          S
        </span>
        <div className="flex flex-col gap-1">
          <span className="bcc-mono text-cardstock">@sample-operator</span>
          <span className="font-serif text-cardstock-deep">Sample Operator</span>
          <p className="mt-2 font-serif text-cardstock-deep italic">
            A placeholder card so you can feel the Vouch action before
            you encounter real operators.
          </p>
        </div>
      </div>
      <div className="mt-4 flex">
        <button
          type="button"
          onClick={onVouch}
          className="bcc-mono inline-flex items-center justify-center self-start border border-cardstock/40 bg-cardstock/5 px-4 py-2 text-sm tracking-[0.18em] text-cardstock transition hover:bg-cardstock/15"
        >
          VOUCH
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Shared navigation buttons. Matching the existing wizard's vocabulary
// (safety-orange continue, underlined back link) so the trust step
// reads as part of the same flow.
// ─────────────────────────────────────────────────────────────────────

function ContinueButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bcc-stencil flex items-center gap-3 bg-safety px-6 py-3 text-ink"
    >
      Continue
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="bcc-mono text-cardstock-deep underline-offset-4 hover:underline"
    >
      ← Back
    </button>
  );
}
