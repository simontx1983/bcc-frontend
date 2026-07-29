/**
 * combos.ts — the curated rank×trust states the onboarding reputation
 * demo cycles through. New content, written for this demo — does NOT
 * touch the constitutionally-locked strings in `lib/copy/trust-layer.ts`.
 *
 * Tier labels follow bcc-trust's honest `ReputationTierMap::TIER_LABEL`
 * (elite displays as "Elite"; the internal key is also `elite`
 * since that's what drives the `--bcc-trust-elite` gold everywhere else).
 *
 * Border color is null for the three middle bands on purpose — gold/
 * red borders stay rare and meaningful, mirroring the real feed's
 * eventual "only the extremes" rule (task 4, gated separately).
 *
 * `rankLabel` must always be a rung from `lib/identity/rank-ladder` — the
 * top rung is **Veteran** (renamed from Master in contract v1.58, because
 * level 3 tests tenure: 5 pulls + 3 votes + 30 days of account age).
 * Captions must not imply a rank says anything about skill or
 * trustworthiness; that is the trust axis's job. The `risky-veteran` combo
 * is the load-bearing one — it exists to teach that the two axes are
 * independent, and it only reads honestly because Veteran claims tenure
 * rather than mastery. Guarded by components/identity/rank-ladder.test.ts.
 */

import type { ReputationTier } from "@/lib/api/types";

export interface ReputationDemoCombo {
  id: string;
  rankLabel: string;
  reputationTier: ReputationTier;
  tierLabel: string;
  /** CSS color value for the post card's border, or null = default border. */
  borderColor: string | null;
  caption: string;
  stokeCount: number;
  commentCount: number;
  shareCount: number;
}

export const REPUTATION_DEMO_COMBOS: readonly ReputationDemoCombo[] = [
  {
    id: "proven-veteran",
    rankLabel: "Veteran",
    reputationTier: "elite",
    tierLabel: "Elite",
    borderColor: "var(--bcc-trust-elite)",
    caption:
      "The highest trust band on the floor — backed by people who've actually worked with them, not a badge you can buy or rush. The Veteran tag underneath is just time served; the gold is the part others had to give them.",
    stokeCount: 412,
    commentCount: 58,
    shareCount: 21,
  },
  {
    id: "trusted-apprentice",
    rankLabel: "Apprentice",
    reputationTier: "trusted",
    tierLabel: "Trusted",
    borderColor: null,
    caption:
      "New to the floor, but already vouched for by people with a track record of their own. Trust isn't locked to seniority — a newcomer can earn it fast if the work holds up.",
    stokeCount: 34,
    commentCount: 6,
    shareCount: 2,
  },
  {
    id: "risky-veteran",
    rankLabel: "Veteran",
    reputationTier: "risky",
    tierLabel: "Risky",
    borderColor: "var(--bcc-trust-risky)",
    caption:
      "Rank and trust measure different things. Rank is time and activity — this member has plenty of both. Trust is what other people say about them, and recent disputes have pulled theirs down. Long-standing is not the same as reliable.",
    stokeCount: 19,
    commentCount: 47,
    shareCount: 3,
  },
  {
    id: "neutral-journeyman",
    rankLabel: "Journeyman",
    reputationTier: "neutral",
    tierLabel: "Neutral",
    borderColor: null,
    caption:
      "No red flags, but no long track record either — this is where most operators sit while they're still building a public history. Neither a warning nor an endorsement, just the honest starting point.",
    stokeCount: 8,
    commentCount: 1,
    shareCount: 0,
  },
] as const;
