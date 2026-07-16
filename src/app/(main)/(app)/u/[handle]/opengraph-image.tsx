/**
 * /u/[handle]/opengraph-image — dynamically-generated branded OG card.
 *
 * App-Router file convention: a default async function returning an
 * `ImageResponse` (next/og) auto-wires this route as the profile's
 * `og:image` AND `twitter:image` (paired twitter-image.tsx re-exports
 * this module). The manual `openGraph.images` / `twitter.images` entries
 * in page.tsx's generateMetadata were removed so the head carries
 * exactly one image, pointing here.
 *
 * Why a rendered card and not the avatar: most operators have no uploaded
 * photo — the app falls back to an SVG initials monogram, which social
 * crawlers cannot render as a card. This route ALWAYS emits a raster PNG.
 *
 * The card layout / fonts / palette now live in the shared
 * `@/lib/og/card-image` module so the member card and the three entity
 * cards (/v, /p, /c) share one renderer. This route's job is just to
 * fetch the member view-model and map its server-provided presentation
 * fields into the shared `OgCardData` shape. The card is visually
 * identical to the pre-refactor member card.
 *
 * §A2 compliance: every value mapped in (display name, handle,
 * tier_label, rank_label, monogram_color, initials, reputation_score) is
 * a server-provided presentation field read verbatim. No client-side
 * trust math, no tier→color mapping. The only client-side derivations are
 * the shared presentation formatters (`presentationName`,
 * `deriveInitials`), the same §A2-exempt class as date formatters.
 *
 * Always returns a valid image: a `getUser` failure (404 or transient)
 * falls through to the shared generic branded card rather than throwing —
 * a throw here would 500 the social-preview fetch.
 */

import {
  OG_CONTENT_TYPE,
  OG_SIZE,
  loadBrandFonts,
  renderGenericCard,
  renderOgCard,
  type OgCardData,
} from "@/lib/og/card-image";
import { getUser } from "@/lib/api/user-endpoints";
import { deriveInitials } from "@/lib/format/initials";
import { presentationName } from "@/lib/format";

// OG standard canvas. Exported so Next emits the og:image:width/height
// tags and the route advertises the right content type.
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Blue Collar Crypto operator file";
// ISR (F2): the card is anonymous + deterministic per handle, so cache the
// rendered PNG for 1h. Crawler re-fetch / re-share storms then serve the
// cached image instead of re-running satori + re-fetching the view-model.
// A literal is required — route-segment config can't reference an import.
export const revalidate = 3600;

interface OgImageProps {
  params: Promise<{ handle: string }>;
}

export default async function OpengraphImage({ params }: OgImageProps) {
  const { handle } = await params;

  const fonts = await loadBrandFonts();

  // Anonymous read — exactly what a social crawler sees (§3.1 public
  // view-model). A null token is valid; metadata generation has no
  // session anyway. Any failure → generic branded card.
  let profile;
  try {
    profile = await getUser(handle, null, { revalidate });
  } catch {
    return renderGenericCard(fonts);
  }

  const name = presentationName(profile);
  const showHandle = !profile.handle.includes("@");
  // Server-provided crest fields read verbatim (§A2). Initials fall back
  // to the shared deriveInitials helper if the server crest is empty.
  const crest = profile.card.crest;
  const initials =
    crest.initials.trim() !== ""
      ? crest.initials
      : deriveInitials(profile.display_name, profile.handle) || "??";

  const tierLabel = (profile.tier_label ?? "").trim();
  const rankLabel = profile.rank_label.trim();
  const reputation = profile.reputation_score ?? profile.trust_score;

  // Chip order matches the pre-refactor member card: tier (accent) →
  // rank (neutral) → REP (neutral). Tier/rank self-hide when empty.
  const chips: OgCardData["chips"] = [];
  if (tierLabel !== "") chips.push({ text: tierLabel, accent: true });
  if (rankLabel !== "") chips.push({ text: rankLabel, accent: false });
  chips.push({ text: `REP ${reputation}`, accent: false });

  // Tagline: prefer the tier descriptor, fall back to a generic line.
  const tagline =
    tierLabel !== ""
      ? `${tierLabel} · ON THE FLOOR`
      : "OPERATOR ON THE FLOOR";

  return renderOgCard(
    {
      railLabel: "OPERATOR FILE",
      name,
      handle: showHandle ? profile.handle : "",
      monogramColor: crest.monogram_color,
      initials,
      chips,
      tagline,
    },
    fonts,
  );
}
