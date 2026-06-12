/**
 * /c/[slug]/opengraph-image — branded OG card for an NFT-creator entity
 * page.
 *
 * Same shell as /v and /p: fetches the creator card anonymously (entity
 * pages are PUBLIC) and renders via the shared `@/lib/og/card-image` +
 * `@/lib/og/entity-card-data` modules. Next auto-wires this as the page's
 * og:image / twitter:image (twitter-image.tsx re-exports). Any fetch
 * failure → shared generic branded card, never a throw.
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
export const alt = "Blue Collar Crypto creator file";

interface OgImageProps {
  params: Promise<{ slug: string }>;
}

export default async function OpengraphImage({ params }: OgImageProps) {
  const { slug } = await params;

  const fonts = await loadBrandFonts();

  let card;
  try {
    card = await getCardEntity("creator", slug, null);
  } catch {
    return renderGenericCard(fonts);
  }

  return renderOgCard(entityCardData(card, "CREATOR"), fonts);
}
