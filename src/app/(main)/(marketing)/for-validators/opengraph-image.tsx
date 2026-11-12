/**
 * /for-validators/opengraph-image — the preview a pasted link shows in a DM.
 * A link with no preview looks suspicious next to a cold message, so this
 * route always has one. No fetch: the card is fixed copy.
 */

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  loadBrandFonts,
  renderGenericCard,
} from "@/lib/og/card-image";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Blue Collar Crypto for validators";

export default async function OpenGraphImage() {
  return renderGenericCard(await loadBrandFonts(), {
    headline: "FOR VALIDATORS",
    tagline: "Your page · The Trust Score · How to claim it",
  });
}
