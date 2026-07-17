/**
 * /v/[slug]/opengraph-image — branded OG card for a validator entity page.
 *
 * App-Router file convention: returns an `ImageResponse` (next/og) that
 * Next auto-wires as the page's `og:image` AND `twitter:image` (the
 * paired twitter-image.tsx re-exports this module). page.tsx's
 * generateMetadata sets no manual image entries so the head carries
 * exactly one image, pointing here.
 *
 * Card layout / fonts / palette live in the shared `@/lib/og/card-image`
 * module; the validator/project/creator data mapping lives in
 * `@/lib/og/entity-card-data`. This route just fetches the validator
 * card anonymously (entity pages are PUBLIC — a crawler sees the public
 * view-model with a null token) and renders.
 *
 * Always returns a valid image: any fetch failure (404 / transient)
 * falls through to the shared generic branded card rather than throwing.
 */

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  loadBrandFonts,
  renderGenericCard,
  renderOgCard,
} from "@/lib/og/card-image";
import { entityCardData } from "@/lib/og/entity-card-data";
import { getCardEntity } from "@/lib/api/card-endpoints";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Blue Collar Crypto validator file";
// ISR (F2): anonymous + deterministic per slug — cache the rendered PNG for
// 1h so crawler re-fetch / re-share storms skip the satori render + fetch.
// A literal is required — route-segment config can't reference an import.
export const revalidate = 3600;

interface OgImageProps {
  params: Promise<{ slug: string }>;
}

export default async function OpengraphImage({ params }: OgImageProps) {
  const { slug } = await params;

  const fonts = await loadBrandFonts();

  let card;
  try {
    // Anonymous read — public entity view-model (the crawler's view).
    card = await getCardEntity("validator", slug, null, { revalidate });
  } catch {
    return renderGenericCard(fonts);
  }

  return renderOgCard(entityCardData(card, "VALIDATOR"), fonts);
}
