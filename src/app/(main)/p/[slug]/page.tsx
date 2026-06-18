/**
 * /p/[slug] — project entity profile (Phase 4 minimum-viable).
 *
 * Same shell pattern as /v and /c — fetches the §L5 Card view-model
 * for type=project and hands it to <EntityProfile>. Project-specific
 * surfaces (releases timeline, builders strip, related disputes)
 * land in Phase 4 polish.
 */

import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

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
 * generateMetadata — OG / Twitter-card tags for a pasted /p/[slug] link.
 * Shared builder (anon public fetch, no manual og:image — the
 * opengraph-image.tsx convention route owns it). See entity-metadata.ts.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildEntityMetadata({
    kind: "project",
    slug,
    kindLabel: "Project",
    pathPrefix: "/p",
  });
}

export default async function ProjectProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  const token = tokenFromSession(session);

  let card;
  try {
    card = await getCardEntity(
      "project",
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
    <EntityProfile
      card={card}
      kindLabel="Project"
      streamEmptyState={{
        title: "No releases yet",
        body:
          "Releases, drops, and announcements from this project will " +
          "show up here once the team starts posting.",
      }}
      viewerAuthed={session !== null}
    />
  );
}
