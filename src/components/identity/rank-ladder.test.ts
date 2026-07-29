import { describe, expect, it } from "vitest";

import { RANK_RUNGS } from "@/lib/identity/rank-ladder";
import { REPUTATION_DEMO_COMBOS } from "@/components/onboarding/reputation-demo/combos";

/**
 * Regression guard: only apprentice | journeyman | master are recognized ranks.
 *
 * Foreman was scoped as a conferred fourth rung in contract v1.28 and RETIRED
 * in v1.36 — `bcc_user_ranks` dropped, the read placeholders removed, and
 * `GET /members?rank=` deleted server-side. The frontend did not follow for 19
 * days: it kept an `isForeman` prop, a purple token, a FOREMAN callout, an
 * onboarding card, and a rank-filter UI that sent an ignored `?rank=` param —
 * so every chip returned identical unfiltered lists while advertising a rank
 * nobody could hold and omitting Master, which people actually have.
 *
 * These assertions exist so that cannot happen silently again. TypeScript
 * already blocks the wire side (there is no type admitting "foreman"); this
 * covers the rendered copy, which types cannot police.
 *
 * The authoritative backend twin is
 * IdentityRankLevelTest::testEarnedLadderIsApprenticeJourneymanMaster.
 */
describe("rank ladder", () => {
  it("is exactly Apprentice → Journeyman → Master", () => {
    expect(RANK_RUNGS).toEqual(["Apprentice", "Journeyman", "Master"]);
  });

  it("tops out at Master — there is no rung above it", () => {
    expect(RANK_RUNGS.at(-1)).toBe("Master");
  });

  it("recognizes no conferred fourth rank", () => {
    const lowered = RANK_RUNGS.map((r) => r.toLowerCase());
    expect(lowered).not.toContain("foreman");
    expect(RANK_RUNGS).toHaveLength(3);
  });

  it("names Master in the onboarding demo, and never Foreman", () => {
    // The demo is the other place a member meets the ladder. It must show the
    // real top rung and must not resurrect the retired one.
    const ranks = REPUTATION_DEMO_COMBOS.map((c) => c.rankLabel);
    expect(ranks).toContain("Master");

    const serialized = JSON.stringify(REPUTATION_DEMO_COMBOS).toLowerCase();
    expect(serialized).not.toContain("foreman");
  });
});
