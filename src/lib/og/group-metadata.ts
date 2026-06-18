/**
 * group-metadata — shared `generateMetadata` builder for the three
 * group-style routes (/communities, /groups, /locals). One source so
 * title/description/canonical/card-type stay identical; only the route
 * prefix (for the canonical URL) differs per caller.
 *
 * Mirrors the entity-metadata / /u[handle] pattern: NO og:image /
 * twitter:image entries here — the sibling `opengraph-image.tsx` /
 * `twitter-image.tsx` convention routes generate the branded card and Next
 * auto-emits the image tags pointing at them. URLs are emitted relative and
 * resolved to absolute by the root layout's `metadataBase` (OG requires
 * absolute).
 *
 * Anon fetch (null token): the public crawler view is exactly what the
 * social preview should reflect. A PRIVATE/secret group surfaces as 404 (or
 * any transient failure) → a safe minimal head rather than a throw (a throw
 * here would 500 the <head> render path). The page itself owns the privacy
 * gate; this builder only governs the shareable preview tags.
 *
 * The canonical is built from the ROUTE the user is on (`/communities` vs
 * `/groups` vs `/locals` + slug) — `GroupDetailResponse.links.self` points
 * at a single fixed surface and would collapse all three routes onto one
 * canonical, so we use the route prefix the caller passes instead.
 */

import type { Metadata } from "next";

import { getGroup } from "@/lib/api/groups-detail-endpoints";
import { ANON_SSR_REVALIDATE_SECONDS } from "@/lib/api/cache-policy";

interface GroupMetadataInput {
  slug: string;
  /** Route prefix for the canonical URL, e.g. "/communities", "/groups",
   *  "/locals". The share + canonical surface the viewer is actually on. */
  pathPrefix: string;
  /** Title-case kind word for copy, e.g. "Community", "Group", "Local". */
  kindLabel: string;
}

export async function buildGroupMetadata({
  slug,
  pathPrefix,
  kindLabel,
}: GroupMetadataInput): Promise<Metadata> {
  // Build the canonical from the route + slug up front so even the 404
  // head carries a stable URL.
  const canonical = `${pathPrefix}/${encodeURIComponent(slug)}`;

  let group;
  try {
    // Anonymous read — the public crawler view. A private/secret group or
    // any transient failure → safe minimal head, never a throw.
    group = await getGroup(slug, null, {
      revalidate: ANON_SSR_REVALIDATE_SECONDS,
    });
  } catch {
    return { title: `${kindLabel} not found · Blue Collar Crypto` };
  }

  const title = `${group.name} · ${kindLabel} on the Floor`;

  const description =
    group.description !== null && group.description.trim() !== ""
      ? group.description.trim()
      : `${group.name} · ${kindLabel} on the Floor — trust, identity, ` +
        `and reputation for crypto operators.`;

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
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}
