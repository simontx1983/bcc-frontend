/**
 * /c/[slug] — NFT-creator entity profile (Phase 4 minimum-viable).
 *
 * Same shell pattern as /v and /p. The Phase 6 work — gallery,
 * featured drop, collectors panel — lands once the NFT indexer is
 * online; for now this surface gives every "View →" link in the feed
 * a real destination instead of a 404.
 */

import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { CreatorGallery } from "@/components/creator/CreatorGallery";
import { EntityProfile } from "@/components/entity/EntityProfile";
import { authOptions } from "@/lib/auth";
import { tokenFromSession } from "@/lib/api/client";
import { getCardEntity } from "@/lib/api/card-endpoints";
import { ANON_SSR_REVALIDATE_SECONDS } from "@/lib/api/cache-policy";
import { buildEntityMetadata } from "@/lib/og/entity-metadata";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * generateMetadata — OG / Twitter-card tags for a pasted /c/[slug] link.
 * Shared builder (anon public fetch, no manual og:image — the
 * opengraph-image.tsx convention route owns it). See entity-metadata.ts.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildEntityMetadata({
    kind: "creator",
    slug,
    kindLabel: "NFT Creator",
    pathPrefix: "/c",
  });
}

export default async function CreatorProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  const token = tokenFromSession(session);

  let card;
  try {
    card = await getCardEntity(
      "creator",
      slug,
      token,
      token === null ? { revalidate: ANON_SSR_REVALIDATE_SECONDS } : undefined,
    );
  } catch (err) {
    if (err instanceof BccApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <>
      <EntityProfile
        card={card}
        kindLabel="NFT Creator"
        streamEmptyState={{
          title: "No drops yet",
          body:
            "Once this creator drops a piece or announces a release, " +
            "their stream will show up here.",
        }}
        viewerAuthed={session !== null}
      />

      {/* §H1 NFT gallery — client-side query against
          /bcc/v1/creators/:slug/gallery. Server-side SWR pattern: any
          stale rows trigger a background refresh; the UI shows a
          "Coming soon" / "Loading collection…" placeholder for first-
          ever requests. */}
      <CreatorGallery slug={slug} creatorName={card.name} />
    </>
  );
}
