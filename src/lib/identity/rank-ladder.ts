/**
 * The earned rank ladder — the ONLY recognized ranks.
 *
 * Lives here rather than inside RankInfoModal so it can be imported without
 * dragging in the modal's data-fetching graph (useUser → API client → env),
 * and so any surface explaining the ladder reads from one place.
 *
 * Rank is auto-derived from the feature-access LEVEL
 * (`RankService::LEVEL_TO_RANK`): new → apprentice, active → journeyman,
 * veteran → master. Master is the top; there is no rung above it.
 *
 * A conferred fourth rung (Foreman) was scoped in contract v1.28 and RETIRED
 * in v1.36 — no conferral path was ever built. Do not reintroduce it.
 * Guarded by src/components/identity/rank-ladder.test.ts.
 */
export const RANK_RUNGS = ["Apprentice", "Journeyman", "Master"] as const;
