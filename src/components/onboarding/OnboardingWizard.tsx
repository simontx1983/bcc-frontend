"use client";

/**
 * OnboardingWizard — the post-signup setup surface.
 *
 * Four steps, per the §B4 plan + §O1 dopamine moment + V2 Phase 2
 * retention slice:
 *
 *   1. "chain"         — pick a home chain (skippable). Stores the choice
 *                        locally; persisted to wp_usermeta.bcc_home_chain
 *                        on the final POST /me/onboarding/complete call.
 *   2. "pulls"         — first-watch suggestions. Each Watch commits
 *                        immediately to the watchlist via POST
 *                        /me/watching/watch (real mutation; server's batch
 *                        aggregator decides when those become a feed
 *                        item per §C3). Internal variable name "pulls"
 *                        retained as a step label — the step still uses
 *                        the legacy onboarding-state vocabulary; only
 *                        the user-facing copy + API path changed.
 *   3. "notifications" — V2 Phase 2 retention slice. Surfaces the bell /
 *                        email digest / push opt-ins so users learn the
 *                        channel exists at signup, not by digging into
 *                        /settings/notifications later. Skippable — the
 *                        bell is on by default for everything; email
 *                        digest is off; push master is off until the user
 *                        explicitly enables it (browser permission gate).
 *                        Pairs with the server-side `bcc_welcome` bell
 *                        notification (NotificationDispatcher::onUserSignup)
 *                        which arrives within seconds of signup so a user
 *                        who turns the bell on sees something there.
 *   4. "dopamine"      — the §O1 send-off. Cards fly into a watchlist icon
 *                        (the visual still uses the 3-ring binder iconography
 *                        per pattern-registry) with rarity-tinted glow trails, a stat-pop
 *                        appears, the cream cardstock backdrop fades to
 *                        concrete floor. Mutation fires in parallel; once
 *                        both the animation has played its minimum hold
 *                        AND the server has flipped the onboarded flag,
 *                        we route the user to /.
 *                        `prefers-reduced-motion` users see a still
 *                        confirmation tile and route immediately after
 *                        the mutation settles.
 *
 * Sticky 3-bullet explainer strip rides above steps 1 + 2 + 3 — no
 * separate welcome screen. Disappears for the dopamine step so the
 * full-bleed animation can take over.
 *
 * Per-card pending state during step 2: tracked in a local Set so
 * concurrent clicks on different cards work; the click-through is
 * gated when pending.
 *
 * Phase 3.3 split: this file keeps the step machine + the explainer
 * strip; the steps live in sibling modules (HomeChainStep /
 * FirstPullsStep / NotificationsStep / DopamineStep) and the pulled-
 * state machine lives in useWizardPulls.ts. Public export + props
 * are unchanged.
 */

import { useState } from "react";

import { CollectionsStep } from "@/components/onboarding/CollectionsStep";
import { DopamineStep } from "@/components/onboarding/DopamineStep";
import { FirstPullsStep } from "@/components/onboarding/FirstPullsStep";
import { HomeChainStep } from "@/components/onboarding/HomeChainStep";
import { NotificationsStep } from "@/components/onboarding/NotificationsStep";
import { OnboardingTrustLayerSteps } from "@/components/onboarding/OnboardingTrustLayerSteps";
import { useWizardPulls } from "@/components/onboarding/useWizardPulls";
import type { HomeChain } from "@/lib/api/types";

// ─────────────────────────────────────────────────────────────────────
// Step machine
// ─────────────────────────────────────────────────────────────────────

type Step =
  | "chain"
  | "pulls"
  | "collections"
  | "trust"
  | "notifications"
  | "dopamine";

export interface OnboardingWizardProps {
  handle: string;
}

export function OnboardingWizard({ handle }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("chain");
  const [homeChain, setHomeChain] = useState<HomeChain | null>(null);
  const pulls = useWizardPulls();

  const wizardLabel: Record<Step, string> = {
    chain:         "Step 1 of 6 · Home Chain",
    pulls:         "Step 2 of 6 · Start watching",
    collections:   "Step 3 of 6 · Your collections",
    trust:         "Step 4 of 6 · How the graph works",
    notifications: "Step 5 of 6 · Stay Posted",
    dopamine:      "Step 6 of 6 · Welcome",
  };

  return (
    <main className="min-h-screen pb-24">
      <header className="bcc-rail">
        <span>
          <span className="bcc-rail-dot" />
          BCC // Onboarding · {wizardLabel[step]}
        </span>
        <span className="bcc-mono text-bcc-text-secondary">@{handle}</span>
      </header>

      {/* ExplainerStrip is a brief "how the Floor works" header for
          the early wizard steps. The trust step is its own thorough
          explainer (4 cards), so the strip would be redundant there
          — hide it. Dopamine is the full-bleed send-off — also hide. */}
      {step !== "dopamine" && step !== "trust" && <ExplainerStrip />}

      {step === "chain" && (
        <HomeChainStep
          selected={homeChain}
          onSelect={setHomeChain}
          onContinue={() => setStep("pulls")}
        />
      )}

      {step === "pulls" && (
        <FirstPullsStep
          pulls={pulls}
          onBack={() => setStep("chain")}
          onDone={() => setStep("collections")}
        />
      )}

      {step === "collections" && (
        <CollectionsStep
          onBack={() => setStep("pulls")}
          onDone={() => setStep("trust")}
        />
      )}

      {step === "trust" && (
        <OnboardingTrustLayerSteps
          onBack={() => setStep("collections")}
          onDone={() => setStep("notifications")}
        />
      )}

      {step === "notifications" && (
        <NotificationsStep
          onBack={() => setStep("trust")}
          onDone={() => setStep("dopamine")}
        />
      )}

      {step === "dopamine" && (
        <DopamineStep
          homeChain={homeChain}
          pulledCards={pulls.snapshot()}
        />
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ExplainerStrip — 3-bullet "how the Floor works" sticky header.
// Rides above steps 1 + 2 per §B4. Always visible (no familiarity
// drop-off here — onboarding is the first encounter, by definition).
// ─────────────────────────────────────────────────────────────────────

function ExplainerStrip() {
  return (
    <div
      className="sticky top-0 z-10 border-b border-cardstock-edge/30 bg-cardstock/95 backdrop-blur"
      role="region"
      aria-label="How the Floor works"
    >
      <div className="mx-auto flex max-w-6xl flex-col items-start gap-y-2 px-6 py-3 sm:px-8 md:flex-row md:flex-wrap md:items-center md:gap-x-8">
        <ExplainerBullet n="1" title="Keep tabs">
          Keep tabs on validators, projects, and creators you trust.
        </ExplainerBullet>
        <ExplainerBullet n="2" title="Earn rank">
          Review, vouch, and post to climb from Apprentice up.
        </ExplainerBullet>
        <ExplainerBullet n="3" title="Link your wallet">
          Connect a wallet to dispute, claim, and put your name on it.
        </ExplainerBullet>
      </div>
    </div>
  );
}

function ExplainerBullet({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-baseline gap-2 text-sm">
      <span className="bcc-mono shrink-0 rounded-sm bg-ink px-1.5 py-0.5 text-[10px] text-cardstock">
        {n}
      </span>
      <span className="bcc-stencil text-ink">{title}</span>
      <span className="font-serif text-ink-soft">— {children}</span>
    </span>
  );
}
