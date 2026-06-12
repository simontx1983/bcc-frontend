/**
 * group-card-data — map a §4.7.5 `GroupDetailResponse` view-model into the
 * shared `OgCardData` shape consumed by `renderOgCard`.
 *
 * Shared by the three group OG routes (/communities, /groups, /locals
 * /[slug]/opengraph-image.tsx) so community / group / local cards build
 * their card data identically — only the route-static kind context the
 * caller already knows differs, and that's derived from `group.type` here.
 *
 * §A2: every field read here is server-provided presentation. The kind
 * rail label is a tasteful mapping of the server `type` enum (a discovery
 * enum, not trust math); the member-count and chain-tag chips are
 * server-provided counts/slugs rendered verbatim; the verification chip
 * reads `verification.label` VERBATIM (server-pinned copy per §A2 — we do
 * NOT invent "ON-CHAIN VERIFIED" or any label). No trust math, no
 * tier→color mapping.
 *
 * Crest is MONOGRAM-FIRST for reliability: group initials derived from the
 * name via the shared `deriveInitials`, drawn in a neutral brand accent.
 * We deliberately do NOT fetch the remote NFT cover (`image_url`) into the
 * Satori card — the same SVG/remote-host fragility call we made for member
 * avatars. The monogram always renders.
 *
 * The `OgCardData` shape fits a group without extension: groups have no
 * @handle, so `handle` is the empty string (which `renderOgCard` reads as
 * "suppress the @ line"), and the secondary identity (member count, chain
 * tag, on-chain verification) surfaces through the chip row instead. The
 * member/entity card output is therefore byte-identical — no shape change.
 */

import { deriveInitials } from "@/lib/format/initials";
import type { GroupDetailResponse } from "@/lib/api/types";
import type { OgCardData } from "@/lib/og/card-image";

// Neutral brand accent for the crest — groups have no tier, so we don't
// borrow a tier color. This matches the app's --bcc-primary accent blue
// already inlined in card-image.tsx.
const GROUP_CREST_COLOR = "#16b5e6";

/**
 * Tasteful uppercase rail/kind label from the discovery `type` enum.
 * NFT holder groups read as "NFT COMMUNITY"; locals as "LOCAL"; system +
 * plain user groups both read as the generic "COMMUNITY".
 */
function railLabelForType(type: GroupDetailResponse["type"]): string {
  switch (type) {
    case "nft":
      return "NFT COMMUNITY";
    case "local":
      return "LOCAL";
    case "system":
    case "user":
      return "COMMUNITY";
    default:
      return "COMMUNITY";
  }
}

/**
 * Build OgCardData for a group/community/local detail card.
 *
 * @param group the §4.7.5 GroupDetailResponse view-model.
 */
export function groupCardData(group: GroupDetailResponse): OgCardData {
  const railLabel = railLabelForType(group.type);

  const initials = deriveInitials(group.name, group.slug) || "##";

  // Chip order: member count (neutral) → on-chain verification (accent,
  // server label verbatim) → optional chain tag (neutral). The member
  // count carries the "secondary line" the @handle would on a person.
  const chips: OgCardData["chips"] = [];

  const memberWord = group.member_count === 1 ? "MEMBER" : "MEMBERS";
  chips.push({ text: `${group.member_count} ${memberWord}`, accent: false });

  if (group.verification !== null) {
    const label = group.verification.label.trim();
    if (label !== "") chips.push({ text: label, accent: true });
  }

  if (group.chain_tag !== null && group.chain_tag.trim() !== "") {
    chips.push({ text: group.chain_tag.toUpperCase(), accent: false });
  }

  return {
    railLabel,
    name: group.name,
    // Groups have no @handle — empty string suppresses the @ line in the
    // shared renderer. Secondary identity lives in the chip row above.
    handle: "",
    monogramColor: GROUP_CREST_COLOR,
    initials,
    chips,
    tagline: `${railLabel} · ON THE FLOOR`,
  };
}
