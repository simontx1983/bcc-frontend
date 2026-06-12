/**
 * entity-card-data — map a §L5 entity `Card` view-model into the shared
 * `OgCardData` shape consumed by `renderOgCard`.
 *
 * Shared by the three entity OG routes (/v, /p, /c /[slug]/
 * opengraph-image.tsx) so the validator / project / creator cards build
 * their card data identically — only the KIND label differs, and that's
 * passed in by the caller.
 *
 * §A2: every field read here is server-provided presentation. The kind
 * label is route-static copy (the caller knows whether it fetched a
 * validator, project, or creator), the tier label / monogram color /
 * trust score come straight off the card, and the validator status chip
 * reads `onchain_signals.status` verbatim. No trust math, no tier→color
 * mapping.
 */

import { deriveInitials } from "@/lib/format/initials";
import { presentationName } from "@/lib/format";
import type { Card, ValidatorOnchainStatus } from "@/lib/api/types";
import type { OgCardData } from "@/lib/og/card-image";

/** Human label for the on-chain validator status (presentation only). */
function statusLabel(status: ValidatorOnchainStatus): string {
  switch (status) {
    case "active":
      return "ACTIVE";
    case "inactive":
      return "INACTIVE";
    case "jailed":
      return "JAILED";
    default:
      return "";
  }
}

/**
 * Build OgCardData for an entity card.
 *
 * @param card      the §L5 Card view-model (validator / project / creator)
 * @param railLabel uppercase KIND label for the rail + tagline
 *                  ("VALIDATOR" / "PROJECT" / "CREATOR")
 */
export function entityCardData(card: Card, railLabel: string): OgCardData {
  const name = presentationName({
    display_name: card.name,
    handle: card.handle,
  });
  const showHandle = card.handle !== "" && !card.handle.includes("@");

  const crest = card.crest;
  const initials =
    crest.initials.trim() !== ""
      ? crest.initials
      : deriveInitials(card.name, card.handle) || "??";

  const tierLabel = (card.tier_label ?? "").trim();
  const reputation = card.reputation_score ?? card.trust_score;

  // Chip order: tier (accent) → REP (neutral) → optional on-chain status
  // (neutral). Status surfaces only when the card carries resolved
  // on-chain signals (validators) — kept simple, no extra fetch.
  const chips: OgCardData["chips"] = [];
  if (tierLabel !== "") chips.push({ text: tierLabel, accent: true });
  chips.push({ text: `REP ${reputation}`, accent: false });

  if (
    card.onchain_signals !== null &&
    card.onchain_signals !== undefined
  ) {
    const label = statusLabel(card.onchain_signals.status);
    if (label !== "") chips.push({ text: label, accent: false });
  }

  return {
    railLabel,
    name,
    handle: showHandle ? card.handle : "",
    monogramColor: crest.monogram_color,
    initials,
    chips,
    tagline: `${railLabel} · ON THE FLOOR`,
  };
}
