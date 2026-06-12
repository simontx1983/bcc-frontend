/**
 * entity-metadata — shared `generateMetadata` builder for the three
 * entity routes (/v, /p, /c). One source so title/description/canonical/
 * card-type stay identical across kinds; only the kind label + 404
 * fallback copy differ.
 *
 * Mirrors the /u/[handle] pattern: NO og:image / twitter:image entries
 * here — the sibling `opengraph-image.tsx` / `twitter-image.tsx`
 * convention routes generate the branded card and Next auto-emits the
 * image tags pointing at them. URLs are emitted relative and resolved to
 * absolute by the root layout's `metadataBase` (OG requires absolute).
 *
 * Entity pages are PUBLIC, so the fetch uses a null token — the public
 * view-model is exactly what a social crawler sees. A 404 / transient
 * failure → minimal "not found" head rather than a throw (a throw here
 * would 500 the <head> render path).
 */

import type { Metadata } from "next";

import { getCardEntity } from "@/lib/api/card-endpoints";
import { presentationName } from "@/lib/format";
import type { CardKind } from "@/lib/api/types";

interface EntityMetadataInput {
  kind: Extract<CardKind, "validator" | "project" | "creator">;
  slug: string;
  /** Title-case kind label for copy, e.g. "Validator", "Project", "Creator". */
  kindLabel: string;
  /** Route prefix for the canonical URL, e.g. "/v", "/p", "/c". */
  pathPrefix: string;
}

export async function buildEntityMetadata({
  kind,
  slug,
  kindLabel,
  pathPrefix,
}: EntityMetadataInput): Promise<Metadata> {
  let card;
  try {
    card = await getCardEntity(kind, slug, null);
  } catch {
    // 404 or any transient failure → safe minimal head. Don't throw.
    return { title: `${kindLabel} not found · Blue Collar Crypto` };
  }

  const name = presentationName({
    display_name: card.name,
    handle: card.handle,
  });
  const handleSuffix =
    card.handle !== "" && !card.handle.includes("@")
      ? ` (@${card.handle})`
      : "";
  const title = `${name}${handleSuffix}`;

  const bio = card.bio.trim();
  const description =
    bio !== ""
      ? bio
      : `${name} · ${kindLabel} on the Floor — trust, identity, and reputation for crypto operators.`;

  // Prefer the server-supplied entity route (`/v/:slug` etc.) read
  // verbatim per §A2; fall back to building from the route prefix + slug.
  const canonical =
    card.links.self !== ""
      ? card.links.self
      : `${pathPrefix}/${encodeURIComponent(slug)}`;

  // No image entries — the opengraph-image.tsx / twitter-image.tsx
  // convention routes own them. The generated card is a wide 1200×630
  // PNG, so the twitter card type is summary_large_image.
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical,
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
