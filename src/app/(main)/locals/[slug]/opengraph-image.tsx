/**
 * /locals/[slug]/opengraph-image — branded OG card for a Local detail page.
 *
 * App-Router file convention: returns an `ImageResponse` (next/og) that
 * Next auto-wires as the page's `og:image` AND `twitter:image` (the paired
 * twitter-image.tsx re-exports this module). page.tsx's generateMetadata
 * sets no manual image entries so the head carries exactly one image.
 *
 * A Local is a semantic wrapper over a PeepSo group; the same
 * `GET /bcc/v1/groups/{slug}` view-model powers the card (the group's
 * `type` is "local", which the mapper reads as the "LOCAL" rail). We fetch
 * the group anonymously (the crawler's public view with a null token) and
 * render via the shared group → OgCardData mapping.
 *
 * Always returns a valid image: any fetch failure (404, or a private/secret
 * group 403/404 for an anon reader) falls through to the shared generic
 * branded card rather than throwing. The page itself owns the privacy gate.
 */

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  loadBrandFonts,
  renderGenericCard,
  renderOgCard,
} from "@/lib/og/card-image";
import { groupCardData } from "@/lib/og/group-card-data";
import { getGroup } from "@/lib/api/groups-detail-endpoints";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Blue Collar Crypto local file";

interface OgImageProps {
  params: Promise<{ slug: string }>;
}

export default async function OpengraphImage({ params }: OgImageProps) {
  const { slug } = await params;

  const fonts = await loadBrandFonts();

  let group;
  try {
    group = await getGroup(slug, null);
  } catch {
    return renderGenericCard(fonts);
  }

  return renderOgCard(groupCardData(group), fonts);
}
