/**
 * /c/[slug] — NFT-creator entity profile (Phase 4 minimum-viable).
 *
 * Same shell pattern as /v and /p. The Phase 6 work — gallery,
 * featured drop, collectors panel — lands once the NFT indexer is
 * online; for now this surface gives every "View →" link in the feed
 * a real destination instead of a 404.
 */

import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { CreatorGallery } from "@/components/creator/CreatorGallery";
import { EntityProfile } from "@/components/entity/EntityProfile";
import { authOptions } from "@/lib/auth";
import { getCardEntity } from "@/lib/api/card-endpoints";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CreatorProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  const token = session?.bccToken ?? null;

  let card;
  try {
    card = await getCardEntity("creator", slug, token);
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
          "Coming soon" / "Pulling from-chain…" placeholder for first-
          ever requests. */}
      <CreatorGallery slug={slug} creatorName={card.name} />
    </>
  );
}
