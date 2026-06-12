/**
 * /groups/[slug]/opengraph-image — branded OG card for a group detail page.
 *
 * App-Router file convention: returns an `ImageResponse` (next/og) that
 * Next auto-wires as the page's `og:image` AND `twitter:image` (the paired
 * twitter-image.tsx re-exports this module). page.tsx's generateMetadata
 * sets no manual image entries so the head carries exactly one image.
 *
 * Card layout / fonts / palette live in the shared `@/lib/og/card-image`
 * module; the group → OgCardData mapping lives in `@/lib/og/group-card-data`.
 * This route fetches the group anonymously (the crawler's public view with
 * a null token) and renders.
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
export const alt = "Blue Collar Crypto group file";

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
