"use client";

/**
 * ReputationDemo — the orchestrator for the onboarding trust step's live
 * demo (replaces the old flat "sample vouch card"). Cycles a shared index
 * through `REPUTATION_DEMO_COMBOS`, driving a demo post card + a demo
 * author card in sync so the visitor sees the SAME rank/trust combo swap
 * on both real-component-shaped surfaces at once.
 *
 * Reduced motion: no interval at all — renders the first combo once,
 * static, per the "one representative state, no loop" rule (see
 * usePrefersReducedMotion call sites in DopamineStep.tsx for the same
 * pattern).
 *
 * Hover/touch pauses the cycle (on the post card) so a visitor reading a
 * longer caption isn't fighting the timer — mouse leave / touch end
 * resumes it.
 *
 * Layout: the author card sits beside `description` (the screen's
 * reputation/reliability teaching — short, roughly card-height prose),
 * the two columns vertically centered against each other (the "See it
 * in action" label that used to sit above this row is gone now, so
 * centering no longer reads as a stray gap under an orphaned label —
 * it's just two blocks of different height, centered); the post card
 * runs full-width underneath, "in action" on its own row. Width is the
 * caller's call — this component fills its parent.
 */

import { useEffect, useState, type ReactNode } from "react";

import { DemoAuthorCard } from "@/components/onboarding/reputation-demo/DemoAuthorCard";
import { DemoPostCard } from "@/components/onboarding/reputation-demo/DemoPostCard";
import { REPUTATION_DEMO_COMBOS, type ReputationDemoCombo } from "@/components/onboarding/reputation-demo/combos";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const CYCLE_MS = 3800;

export function ReputationDemo({ description }: { description: ReactNode }) {
  const reducedMotion = usePrefersReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reducedMotion || paused) return;
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % REPUTATION_DEMO_COMBOS.length);
    }, CYCLE_MS);
    return () => clearInterval(id);
  }, [reducedMotion, paused]);

  const combo = REPUTATION_DEMO_COMBOS[index % REPUTATION_DEMO_COMBOS.length] as ReputationDemoCombo;

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-[18px]">
          {description}
        </div>
        <div className="min-w-0 shrink-0 md:w-[240px]">
          <DemoAuthorCard combo={combo} reducedMotion={reducedMotion} />
        </div>
      </div>
      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={() => setPaused(true)}
        onTouchEnd={() => setPaused(false)}
        onTouchCancel={() => setPaused(false)}
      >
        <DemoPostCard combo={combo} burstKey={reducedMotion ? 0 : index} reducedMotion={reducedMotion} />
      </div>
    </div>
  );
}
