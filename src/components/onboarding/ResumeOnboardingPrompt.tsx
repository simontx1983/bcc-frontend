"use client";

/**
 * ResumeOnboardingPrompt — "resume setup?" floating affordance (task 7,
 * `_handovers/HANDOVER-onboarding-tour-followups.md`). None of the wizard
 * steps are mandatory, so a returning visitor is never forced back into
 * /onboarding — everyone lands on the Floor. This is the opt-in nudge for
 * the case where a visitor's setup was genuinely interrupted (got past
 * the welcome screen, never reached the send-off).
 *
 * Self-guarding, like TourAutoStart: reads localStorage on mount (client-
 * only — SSR always renders nothing, so there's no hydration flash) and
 * renders null unless real, undismissed progress exists. Mount this once,
 * home-feed only (not site-wide).
 */

import { useEffect, useState } from "react";
import { PlayCircle } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";

import { Dialog } from "@/components/ui/Dialog";
import {
  clearOnboardingProgress,
  dismissResume,
  getOnboardingProgress,
  isResumeDismissed,
} from "@/lib/onboarding/storage";

export function ResumeOnboardingPrompt() {
  // null = not yet checked (SSR + first client tick) or not eligible.
  const [resumeStep, setResumeStep] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (isResumeDismissed()) return;
    const progress = getOnboardingProgress();
    // "welcome" alone isn't real progress — nothing was actually filled
    // in yet, so there's nothing meaningful to resume.
    if (progress === null || progress.step === "welcome") return;
    setResumeStep(progress.step);
  }, []);

  if (resumeStep === null) return null;

  const handleSkip = () => {
    dismissResume();
    clearOnboardingProgress();
    setModalOpen(false);
    setResumeStep(null);
  };

  return (
    <>
      <div className="bcc-resume-fab-tooltip" role="status">
        Your setup was interrupted — want to finish?
      </div>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="bcc-resume-fab"
        aria-label="Resume onboarding setup"
        title="Resume setup"
      >
        <PlayCircle size={22} strokeWidth={1.8} aria-hidden />
      </button>

      {modalOpen && (
        <Dialog
          title="Finish setting up?"
          onClose={() => setModalOpen(false)}
          center
          animateIn
          glass
          panelClassName="max-w-[380px] flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1.5">
            <span className="bcc-stencil text-[20px] leading-none text-[var(--bcc-text)]">
              Finish setting up?
            </span>
            <p className="text-[13px] leading-snug text-[var(--bcc-text-secondary)]">
              Your setup was interrupted. Every step is optional — pick up right where you left off, or skip it for good.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/onboarding?step=${resumeStep}` as Route}
              className="bcc-btn bcc-btn-sm bcc-btn-primary flex-1 justify-center"
              onClick={() => setModalOpen(false)}
            >
              Continue
            </Link>
            <button
              type="button"
              onClick={handleSkip}
              className="bcc-btn bcc-btn-sm bcc-btn-ghost flex-1 justify-center"
            >
              Skip
            </button>
          </div>
        </Dialog>
      )}
    </>
  );
}
