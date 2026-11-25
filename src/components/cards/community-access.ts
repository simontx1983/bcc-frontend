/**
 * How you get into a community, said ONE way everywhere: the card back
 * (CommunityDossier), the card's standing strip (CardStandingStrip) and
 * the detail page (GroupDetailShell).
 *
 * `communityAccessLabel` — the access word. Precedence:
 *   1. a delegator (validator) group is "Delegators only": it's stored
 *      closed, but nobody requests anything — the join verifies the
 *      delegation — so "Request to join" would describe a queue that
 *      isn't there;
 *   2. the trust gate beats privacy: trust groups run on PeepSo's "open"
 *      privacy under the hood, so `trust_min` is the canonical gate;
 *   3. then privacy.
 *
 * `holdingRequirement` — a holder group's second gate, which the access
 * word can't express: "Open to all" and "Requires 1 NFT" are both true of
 * a holder group at once. Server-formatted (`min_balance_display`, §A2).
 *
 * Plain module (no hooks, no JSX): server and client components share it.
 */

import type { CardCommunityDossier, CollectionStats } from "@/lib/api/types";

/** The facts the access word reads. A card's dossier and a group detail both carry them. */
export type CommunityAccessFacts = Pick<CardCommunityDossier, "type" | "privacy" | "trust_min">;

export function communityAccessLabel(community: CommunityAccessFacts): string {
  if (community.type === "validator") return "Delegators only";
  if (community.trust_min !== null) return `Trust ${community.trust_min}+`;
  if (community.privacy === "closed") return "Request to join";
  if (community.privacy === "secret") return "Invite-only";
  return "Open to all";
}

/** "Requires 1 NFT" for a holder group with a holding threshold; null otherwise. */
export function holdingRequirement(stats: CollectionStats | null): string | null {
  const threshold = stats?.min_balance_display ?? null;
  return threshold !== null && threshold !== "" ? `Requires ${threshold}` : null;
}
