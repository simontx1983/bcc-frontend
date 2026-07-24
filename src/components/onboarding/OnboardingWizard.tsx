"use client";

/**
 * OnboardingWizard — the post-signup setup surface.
 *
 * Redesigned onto the page-chrome token system (`bcc-onb-*`, matching the
 * landing "LEDGER" direction) — the old workshop/cardstock palette is gone.
 * Streamlined lineup (6 screens):
 *
 *   1. "welcome"       — one-line framing + a 3-card preview of setup.
 *                        Primary "Let's go"; "Skip setup" jumps straight to
 *                        the send-off (which still fires /complete).
 *   2. "identity"      — avatar · cover · bio. Skippable. Seeded from the
 *                        server-fetched MemberProfile; media commits
 *                        immediately, bio saves on Continue.
 *   3. "trust"         — the constitutionally-locked "How the graph works"
 *                        teaching (§J.7), restyled into 2 screens. Copy is
 *                        verbatim; only the presentation changed.
 *   4. "watching"      — first-watch suggestions. Each Watch commits to the
 *                        watchlist immediately. The home-chain pick is folded
 *                        in here as a "bias toward" chip row (persisted on
 *                        the final /complete call).
 *   5. "notifications" — bell / email digest / push opt-ins.
 *   6. "dopamine"      — the §O1 send-off. Cards fly to a watchlist dock,
 *                        the /complete mutation fires in parallel, then routes
 *                        to /. Reduced-motion sees a still tile.
 *
 * The home-chain choice lives in wizard state (`homeChain`) and threads to
 * the watching step's bias chips + the dopamine step's /complete call.
 */

import { useEffect, useState } from "react";

import { DopamineStep } from "@/components/onboarding/DopamineStep";
import { FirstPullsStep } from "@/components/onboarding/FirstPullsStep";
import { IdentityStep } from "@/components/onboarding/IdentityStep";
import { NotificationsStep } from "@/components/onboarding/NotificationsStep";
import { OnboardingTrustLayerSteps } from "@/components/onboarding/OnboardingTrustLayerSteps";
import { WelcomeStep } from "@/components/onboarding/WelcomeStep";
import { useWizardPulls } from "@/components/onboarding/useWizardPulls";
import { clearOnboardingProgress, setOnboardingProgress } from "@/lib/onboarding/storage";
import type { HomeChain, MemberProfile } from "@/lib/api/types";

// ─────────────────────────────────────────────────────────────────────
// Step machine
// ─────────────────────────────────────────────────────────────────────

export type Step =
  | "welcome"
  | "identity"
  | "trust"
  | "watching"
  | "notifications"
  | "dopamine";

// Ordered for the progress bar. `dopamine` is the send-off — it reads as
// "done", so the bar sits at 100% there.
const STEP_ORDER: readonly Step[] = [
  "welcome",
  "identity",
  "trust",
  "watching",
  "notifications",
  "dopamine",
];

/** Type guard for a resume deep link's `?step=` query param — untrusted input. */
export function isValidStep(value: string): value is Step {
  return (STEP_ORDER as readonly string[]).includes(value);
}

const STEP_LABEL: Record<Step, string> = {
  welcome:       "Welcome",
  identity:      "Your identity",
  trust:         "How the graph works",
  watching:      "Start watching",
  notifications: "Stay posted",
  dopamine:      "You're on the floor",
};

export interface OnboardingWizardProps {
  handle: string;
  /** Server-fetched own profile — seeds the identity step's avatar/cover/bio. */
  profile: MemberProfile;
  /**
   * Deep-link entry point for the "resume setup?" prompt (task 7) — start
   * the machine here instead of "welcome". Omitted → normal fresh start.
   */
  initialStep?: Step;
}

export function OnboardingWizard({ handle, profile, initialStep }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>(initialStep ?? "welcome");
  const [homeChain, setHomeChain] = useState<HomeChain | null>(null);
  const pulls = useWizardPulls();

  // Step-progress persistence (task 7) — the local half of "resume
  // setup?". Reaching the send-off screen means the wizard is done (either
  // completed normally or via "Skip setup"), so that's the clear signal,
  // not a step to persist as a resume point.
  useEffect(() => {
    if (step === "dopamine") {
      clearOnboardingProgress();
    } else {
      setOnboardingProgress(step);
    }
  }, [step]);

  const stepIndex = STEP_ORDER.indexOf(step);
  const progressPct = Math.round((stepIndex / (STEP_ORDER.length - 1)) * 100);

  return (
    <div className="bcc-onb-root">
      {/* Ambient field — reused from the landing background treatment. */}
      <div className="bcc-ldg-field" aria-hidden>
        <div className="bcc-ldg-field-grid" />
        <div className="bcc-ldg-field-glow bcc-ldg-field-g1" />
        <div className="bcc-ldg-field-glow bcc-ldg-field-g2" />
      </div>

      <header className="bcc-onb-rail">
        <span>
          <span className="bcc-onb-rail-dot" />
          BCC // Onboarding · Step {Math.min(stepIndex + 1, STEP_ORDER.length)} of{" "}
          {STEP_ORDER.length} · {STEP_LABEL[step]}
        </span>
        <span className="who">@{handle}</span>
      </header>

      <div className="bcc-onb-progress" aria-hidden>
        <div className="bcc-onb-progress-track">
          <div className="bcc-onb-progress-fill" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      <main className="bcc-onb-wrap">
        {step === "welcome" && (
          <WelcomeStep
            handle={handle}
            onStart={() => setStep("identity")}
            onSkipAll={() => setStep("dopamine")}
          />
        )}

        {step === "identity" && (
          <IdentityStep
            profile={profile}
            onBack={() => setStep("welcome")}
            onDone={() => setStep("trust")}
          />
        )}

        {step === "trust" && (
          <OnboardingTrustLayerSteps
            onBack={() => setStep("identity")}
            onDone={() => setStep("watching")}
          />
        )}

        {step === "watching" && (
          <FirstPullsStep
            pulls={pulls}
            homeChain={homeChain}
            onSelectChain={setHomeChain}
            onBack={() => setStep("trust")}
            onDone={() => setStep("notifications")}
          />
        )}

        {step === "notifications" && (
          <NotificationsStep
            onBack={() => setStep("watching")}
            onDone={() => setStep("dopamine")}
          />
        )}

        {step === "dopamine" && (
          <DopamineStep homeChain={homeChain} pulledCards={pulls.snapshot()} />
        )}
      </main>
    </div>
  );
}
