/**
 * The earned rank ladder — the ONLY recognized ranks.
 *
 * Lives here rather than inside RankInfoModal so it can be imported without
 * dragging in the modal's data-fetching graph (useUser → API client → env),
 * and so any surface explaining the ladder reads from one place.
 *
 * Rank is auto-derived from the feature-access LEVEL
 * (`RankService::LEVEL_TO_RANK`): new → apprentice, active → journeyman,
 * veteran → veteran. Veteran is the top; there is no rung above it.
 *
 * WHAT THE LADDER MEASURES — it is tenure, not competence. The gates are
 * 5 pulls (the member's OWN following count), 3 vote rows, and 30 days of
 * ACCOUNT AGE. None requires sustained participation, so copy must never
 * present a rung as evidence of skill or trustworthiness. Trust lives on
 * the other axis (`reputation_tier`).
 *
 * The top rung was labelled "Master" until contract v1.58; it was renamed
 * because level 3 tests tenure. "Master" is RESERVED for a future merit
 * rung earned from outcome-confirmed judgment — do not reuse it as a label
 * until that exists.
 *
 * A conferred fourth rung (Foreman) was scoped in contract v1.28 and RETIRED
 * in v1.36 — no conferral path was ever built. Do not reintroduce it.
 * Guarded by src/components/identity/rank-ladder.test.ts.
 */
export const RANK_RUNGS = ["Apprentice", "Journeyman", "Veteran"] as const;

export type RankRung = (typeof RANK_RUNGS)[number];
