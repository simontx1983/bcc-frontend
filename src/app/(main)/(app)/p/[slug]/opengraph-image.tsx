/**
 * /p/[slug]/opengraph-image — branded OG card for a project entity page.
 *
 * Same shell as /v and /c: fetches the project card anonymously (entity
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
export const alt = "Blue Collar Crypto project file";
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
    card = await getCardEntity("project", slug, null, { revalidate });
  } catch {
    return renderGenericCard(fonts);
  }

  return renderOgCard(entityCardData(card, "PROJECT"), fonts);
}
