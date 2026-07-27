/**
 * combos.ts — the curated rank×trust states the onboarding reputation
 * demo cycles through. New content, written for this demo — does NOT
 * touch the constitutionally-locked strings in `lib/copy/trust-layer.ts`.
 *
 * Tier labels follow bcc-trust's honest `ReputationTierMap::TIER_LABEL`
 * (elite displays as "Proven", not "Elite" — internal key stays `elite`
 * since that's what drives the `--bcc-trust-elite` gold everywhere else).
 *
 * Border color is null for the three middle bands on purpose — gold/
 * red/purple borders stay rare and meaningful, mirroring the real feed's
 * eventual "only the extremes + foreman" rule (task 4, gated separately).
 */

import type { ReputationTier } from "@/lib/api/types";

export interface ReputationDemoCombo {
  id: string;
  rankLabel: string;
  reputationTier: ReputationTier;
  tierLabel: string;
  isForeman: boolean;
  /** CSS color value for the post card's border, or null = default border. */
  borderColor: string | null;
  caption: string;
  stokeCount: number;
  commentCount: number;
  shareCount: number;
}

export const REPUTATION_DEMO_COMBOS: readonly ReputationDemoCombo[] = [
  {
    id: "proven-master",
    rankLabel: "Master",
    reputationTier: "elite",
    tierLabel: "Proven",
    isForeman: false,
    borderColor: "var(--bcc-trust-elite)",
    caption:
      "The highest trust band on the floor. Years of consistent follow-through, backed by people who've actually worked with them — not a badge you can buy or rush.",
    stokeCount: 412,
    commentCount: 58,
    shareCount: 21,
  },
  {
    id: "trusted-apprentice",
    rankLabel: "Apprentice",
    reputationTier: "trusted",
    tierLabel: "Trusted",
    isForeman: false,
    borderColor: null,
    caption:
      "New to the floor, but already vouched for by people with a track record of their own. Trust isn't locked to seniority — a newcomer can earn it fast if the work holds up.",
    stokeCount: 34,
    commentCount: 6,
    shareCount: 2,
  },
  {
    id: "risky-master",
    rankLabel: "Master",
    reputationTier: "risky",
    tierLabel: "Risky",
    isForeman: false,
    borderColor: "var(--bcc-trust-risky)",
    caption:
      "Rank and trust measure different things. This operator has put in the time and knows the platform inside out — but recent disputes and unresolved flags mean their trust score has slipped. Proceed carefully, regardless of experience.",
    stokeCount: 19,
    commentCount: 47,
    shareCount: 3,
  },
  {
    id: "foreman",
    rankLabel: "Journeyman",
    reputationTier: "trusted",
    tierLabel: "Trusted",
    isForeman: true,
    borderColor: "var(--bcc-trust-foreman)",
    caption:
      "Foreman isn't a rank you climb — it's a responsibility the community hands you. Foremen sit on dispute panels and rule on conflicts between operators, which is why the mark stays purple no matter what rank or trust band they're also carrying.",
    stokeCount: 87,
    commentCount: 15,
    shareCount: 5,
  },
  {
    id: "neutral-journeyman",
    rankLabel: "Journeyman",
    reputationTier: "neutral",
    tierLabel: "Neutral",
    isForeman: false,
    borderColor: null,
    caption:
      "No red flags, but no long track record either — this is where most operators sit while they're still building a public history. Neither a warning nor an endorsement, just the honest starting point.",
    stokeCount: 8,
    commentCount: 1,
    shareCount: 0,
  },
] as const;
