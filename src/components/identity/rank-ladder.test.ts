import { describe, expect, it } from "vitest";

import { RANK_RUNGS } from "@/lib/identity/rank-ladder";
import { REPUTATION_DEMO_COMBOS } from "@/components/onboarding/reputation-demo/combos";

/**
 * Regression guard: only apprentice | journeyman | veteran are recognized ranks.
 *
 * Foreman was scoped as a conferred fourth rung in contract v1.28 and RETIRED
 * in v1.36 — `bcc_user_ranks` dropped, the read placeholders removed, and
 * `GET /members?rank=` deleted server-side. The frontend did not follow for 19
 * days: it kept an `isForeman` prop, a purple token, a FOREMAN callout, an
 * onboarding card, and a rank-filter UI that sent an ignored `?rank=` param —
 * so every chip returned identical unfiltered lists while advertising a rank
 * nobody could hold and omitting the real top rung.
 *
 * The top rung was renamed Master → Veteran in contract v1.58, because level 3
 * tests tenure (5 pulls + 3 votes + 30 days of account age), not mastery.
 * "Master" is RESERVED for a future merit rung — so it is now asserted ABSENT
 * for the same reason Foreman is: an unearned label must not reappear in copy.
 *
 * These assertions exist so neither can happen silently again. TypeScript
 * already blocks the wire side; this covers rendered copy, which types cannot
 * police.
 *
 * The authoritative backend twin is
 * IdentityRankLevelTest::testEarnedLadderIsApprenticeJourneymanVeteran.
 */
describe("rank ladder", () => {
  it("is exactly Apprentice → Journeyman → Veteran", () => {
    expect(RANK_RUNGS).toEqual(["Apprentice", "Journeyman", "Veteran"]);
  });

  it("tops out at Veteran — there is no rung above it", () => {
    expect(RANK_RUNGS.at(-1)).toBe("Veteran");
  });

  it("recognizes no conferred fourth rank", () => {
    const lowered = RANK_RUNGS.map((r) => r.toLowerCase());
    expect(lowered).not.toContain("foreman");
    expect(RANK_RUNGS).toHaveLength(3);
  });

  it("does not resurrect Master, which is reserved for an unbuilt merit rung", () => {
    const lowered = RANK_RUNGS.map((r) => r.toLowerCase());
    expect(lowered).not.toContain("master");
  });

  it("names Veteran in the onboarding demo, and never Foreman or Master", () => {
    // The demo is the other place a member meets the ladder. It must show the
    // real top rung and must not resurrect a retired or unearned one.
    const ranks = REPUTATION_DEMO_COMBOS.map((c) => c.rankLabel);
    expect(ranks).toContain("Veteran");

    const serialized = JSON.stringify(REPUTATION_DEMO_COMBOS).toLowerCase();
    expect(serialized).not.toContain("foreman");
    expect(serialized).not.toContain("master");
  });

  it("only ever shows rank labels that are on the ladder", () => {
    // Catches a demo fixture drifting to a label the server can never emit.
    for (const combo of REPUTATION_DEMO_COMBOS) {
      expect(RANK_RUNGS).toContain(combo.rankLabel);
    }
  });
});
