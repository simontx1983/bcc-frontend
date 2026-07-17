/**
 * /post/[id]/opengraph-image — branded OG card for a feed post permalink.
 *
 * Same shell as the entity routes: fetches the post anonymously (the
 * permalink is PUBLIC) and renders via the shared `@/lib/og/card-image`
 * module, mapped through `postCardData`. Any fetch failure → shared
 * generic branded card, never a throw.
 */

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  loadBrandFonts,
  renderGenericCard,
  renderOgCard,
} from "@/lib/og/card-image";
import { postCardData } from "@/lib/og/post-card-data";
import { getFeedItemById } from "@/lib/api/feed-endpoints";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Blue Collar Crypto post";

interface OgImageProps {
  params: Promise<{ id: string }>;
}

export default async function OpengraphImage({ params }: OgImageProps) {
  const { id } = await params;

  const fonts = await loadBrandFonts();

  let item;
  try {
    item = await getFeedItemById(id, null);
  } catch {
    return renderGenericCard(fonts);
  }

  return renderOgCard(postCardData(item), fonts);
}
