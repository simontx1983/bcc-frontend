/**
 * The card face's rules for WHICH stats it shows and WHAT its header says,
 * as plain functions (no hooks, no JSX), so a server component can call
 * them: the detail page's header (GroupDetailShell → DetailHeader) shows
 * the same numbers and kind word as the card you met on the list. The card
 * itself (CardFrontFace, a client component) imports them from here.
 */

import type { Card, CardStat } from "@/lib/api/types";

/**
 * Audience counts live in the nameplate, not the stats grid — an audience
 * measure is not a trust output. Filtering by key keeps the grid to real
 * trust signals (Trust / Reviews / Vouches).
 *
 * `members` is in here for community cards: a community has no trust axis
 * at all (see below), so its head-count is the closest thing it has to an
 * audience number and belongs in the same slot every other kind uses.
 */
const AUDIENCE_STAT_KEYS = new Set(["followers", "watchers", "watching", "members"]);

/**
 * A Hall card is the exception (Phillip, 2026-11-25): its stats row is
 * exactly Members · Posts 7d · Validators, side by side in that order
 * whatever order the server sends them in, and nothing goes under the
 * name. A community card also carries `active` and `access`; on a Hall
 * those stay off the face so the three counts Phillip named are the row.
 * A count the server leaves out (a topic Hall has no validators; an
 * unreadable posts count is omitted) is simply not shown: never a 0.
 */
const HALL_GRID_STAT_KEYS = ["members", "posts_7d", "validators"] as const;

/** A Hall card's row: the named counts it has, in HALL_GRID_STAT_KEYS order. */
function hallGrid(stats: readonly CardStat[]): CardStat[] {
  return HALL_GRID_STAT_KEYS.flatMap((key) => stats.filter((s) => s.key === key).slice(0, 1));
}

/**
 * Split the server's stats into "the one that goes under the handle" and
 * "the grid", and give member cards the Vouches column they were missing.
 *
 * The server ships member cards `trust · reviews_written · watchers` and
 * entity cards `trust · followers · reviews · endorsements`, so once the
 * audience count moves to the nameplate a member card was left with only
 * two columns while an entity had three. The vouch count IS on the wire
 * for members, just on a different block — `member_dossier.engagement.
 * endorsements_received` — so this reads it into the missing column
 * rather than inventing or recomputing anything.
 */
export function splitStats(card: Card): {
  audience: CardStat[];
  grid: CardStat[];
} {
  if (card.card_kind === "community" && card.community_dossier?.type === "hall") {
    return { audience: [], grid: hallGrid(card.stats) };
  }
  const audience = card.stats.filter((s) => AUDIENCE_STAT_KEYS.has(s.key));
  const grid = card.stats.filter((s) => !AUDIENCE_STAT_KEYS.has(s.key));

  const engagement = card.member_dossier?.engagement;
  if (
    card.card_kind === "member" &&
    engagement !== undefined &&
    !grid.some((s) => s.key === "endorsements")
  ) {
    grid.push({
      key: "endorsements",
      label: "Vouches",
      value: String(engagement.endorsements_received),
      raw: engagement.endorsements_received,
      format: "count",
    });
  }

  return { audience, grid };
}

/** The stats row holds at most this many columns. */
export const STATS_ROW_MAX = 3;

/**
 * The counts a card's face shows, listed the way a detail header lists
 * them: the stats row's, then the audience count the card puts under the
 * name. A detail page's header shows these,
 * so it carries the same numbers as the card you met on the list (Site
 * Structure A §12, option B) — a Hall's Members · Posts (7d) · Validators,
 * a member's Trust · Vouches · Reviews · Watchers.
 */
export function cardFaceStats(card: Card): CardStat[] {
  const { audience, grid } = splitStats(card);
  return [...grid.slice(0, STATS_ROW_MAX), ...audience];
}

/**
 * The word in the card's header slot.
 *
 * Card doctrine (Phillip, 2026-11-23, F-563): the four person/entity
 * families say their family word (VALIDATOR, PROJECT, CREATOR, MEMBER).
 * A COMMUNITY-family card says WHICH kind of community it is, from the
 * server's `kicker` (§3.2.4: CHAIN HALL, HOLDER COMMUNITY, DELEGATOR
 * COMMUNITY, SYSTEM COMMUNITY, COMMUNITY), still in the community colour,
 * so the family stays readable. A Hall card used to say "COMMUNITY" on a
 * page titled HALL. No kicker → "community". Server copy, rendered as is.
 */
export function cardHeaderWord(card: Card): string {
  if (card.card_kind !== "community") return card.card_kind;
  const kicker = card.kicker?.trim() ?? "";
  return kicker !== "" ? kicker : "community";
}
