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
 * Capped at 840px (narrower than the trust step's full 1080px content
 * wrap, which otherwise leaves this the only unconstrained-width section
 * on the screen) and bottom-aligned — the author card's height is fixed,
 * the post card's isn't, so lining up their bottom edges instead of their
 * tops keeps the pair looking anchored together at any caption length.
 */

import { useEffect, useState } from "react";

import { DemoAuthorCard } from "@/components/onboarding/reputation-demo/DemoAuthorCard";
import { DemoPostCard } from "@/components/onboarding/reputation-demo/DemoPostCard";
import { REPUTATION_DEMO_COMBOS, type ReputationDemoCombo } from "@/components/onboarding/reputation-demo/combos";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

const CYCLE_MS = 3800;

export function ReputationDemo() {
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
    <div className="flex max-w-[840px] flex-col gap-3 md:flex-row md:items-end md:gap-4">
      <div className="min-w-0 md:w-[30%]">
        <DemoAuthorCard combo={combo} reducedMotion={reducedMotion} />
      </div>
      <div
        className="min-w-0 md:w-[70%]"
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
