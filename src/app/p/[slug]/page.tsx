/**
 * /p/[slug] — project entity profile (Phase 4 minimum-viable).
 *
 * Same shell pattern as /v and /c — fetches the §L5 Card view-model
 * for type=project and hands it to <EntityProfile>. Project-specific
 * surfaces (releases timeline, builders strip, related disputes)
 * land in Phase 4 polish.
 */

import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { EntityProfile } from "@/components/entity/EntityProfile";
import { authOptions } from "@/lib/auth";
import { getCardEntity } from "@/lib/api/card-endpoints";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function ProjectProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  const token = session?.bccToken ?? null;

  let card;
  try {
    card = await getCardEntity("project", slug, token);
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
