/**
 * /v/[slug] — validator entity profile (Phase 4 minimum-viable).
 *
 * Server component. Fetches the §L5 Card view-model for type=validator
 * and renders the shared <EntityProfile>. The §C2 / §B5 claim flow,
 * the locked vs. unlocked stream gating, and the "Wanted" poster
 * overlay all land in Phase 4 polish — this shell is what makes
 * every "View →" link in the feed stop 404'ing.
 *
 * Auth is optional — anonymous browsers see the public view-model.
 * When a session exists we forward the bearer so viewer-aware
 * permission flags resolve.
 *
 * 404 from the backend → Next's `notFound()`. Other failures bubble
 * to the framework error UI.
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

export default async function ValidatorProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  const token = session?.bccToken ?? null;

  let card;
  try {
    card = await getCardEntity("validator", slug, token);
  } catch (err) {
    if (err instanceof BccApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <EntityProfile
      card={card}
      kindLabel="Validator"
      streamEmptyState={{
        title: "No posts yet",
        body:
          "Once the operator claims this validator and starts posting, " +
          "their stream will show up here.",
      }}
      viewerAuthed={session !== null}
    />
  );
}
