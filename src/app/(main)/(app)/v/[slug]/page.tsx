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

import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { EntityProfile } from "@/components/entity/EntityProfile";
import { authOptions } from "@/lib/auth";
import { tokenFromSession } from "@/lib/api/client";
import { getCardEntity } from "@/lib/api/card-endpoints";
import { ANON_SSR_REVALIDATE_SECONDS } from "@/lib/api/cache-policy";
import {
  getAttestationRosterAnon,
  PROFILE_ROSTER_PARAMS,
} from "@/lib/api/attestations-endpoints";
import type { RosterSeed } from "@/hooks/useAttestationRoster";
import { buildEntityMetadata } from "@/lib/og/entity-metadata";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * generateMetadata — OG / Twitter-card tags for a pasted /v/[slug] link.
 * Shared builder (anon public fetch, no manual og:image — the
 * opengraph-image.tsx convention route owns it). See entity-metadata.ts.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildEntityMetadata({
    kind: "validator",
    slug,
    kindLabel: "Validator",
    pathPrefix: "/v",
  });
}

export default async function ValidatorProfilePage({ params }: PageProps) {
  const { slug } = await params;
  const session = await getServerSession(authOptions);
  const token = tokenFromSession(session);

  let card;
  try {
    card = await getCardEntity(
      "validator",
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

  // A visitor lands on Backing (EntityTabs' default), but the roster fetches
  // client-side and renders its empty-state copy while `data` is undefined —
  // so a validator WITH attestations said "No attestations on file yet" for
  // the whole round-trip, and that is what crawlers saw. Read the first page
  // here and seed React Query with it.
  //
  // ANONYMOUS ONLY, two reasons, same as /u/[handle]. The read is token-less
  // so the shared 60s Data-Cache entry can be served to everyone without
  // leaking one viewer's response to another; and we hand it only to viewers
  // who are themselves anonymous, so nobody is shown a cache-shared payload
  // in place of their own.
  //
  // Failure is non-fatal by design: the roster is one tab on a page whose
  // subject is the validator. A roster outage must not 500 the page, so the
  // seed stays undefined and the panel fetches as it always did.
  let rosterSeed: RosterSeed | undefined;
  if (session === null) {
    try {
      const fetchedAt = Date.now();
      const data = await getAttestationRosterAnon(
        "validator_card",
        card.id,
        PROFILE_ROSTER_PARAMS,
        ANON_SSR_REVALIDATE_SECONDS,
      );
      // The real read time, not now: initialData alone would restart the
      // hook's 30s staleTime on the client and let a payload cached for 60s
      // look permanently fresh.
      rosterSeed = { data, updatedAt: fetchedAt };
    } catch {
      rosterSeed = undefined;
    }
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
      {...(rosterSeed !== undefined ? { rosterSeed } : {})}
    />
  );
}
