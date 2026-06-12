/**
 * /communities/[slug] — single-community detail page (§4.7.5).
 *
 * Server component. Cross-kind: works for plain user/system groups
 * AND for NFT holder groups + Locals on the same URL — all four kinds
 * map onto the same `GET /bcc/v1/groups/{slug}` view-model.
 *
 * Thin shell over `GroupDetailShell`. Stream tab is the default for
 * /communities/[slug]; the /about + /members sub-routes mount the same
 * shell with their respective `initialTab`.
 *
 * URL-aware tabs (urlBase set) — clicking a tab routes to the canonical
 * sub-URL so SEO + external deeplinks stay intact.
 *
 * 404 from `/groups/{slug}` → Next's `notFound()`. The server returns
 * 404 for both "missing slug" AND "secret + non-member" on purpose —
 * never distinguish them on the wire (privacy leak per §S).
 */

import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { GroupDetailShell } from "@/components/groups/GroupDetailShell";
import { authOptions } from "@/lib/auth";
import { tokenFromSession } from "@/lib/api/client";
import { getGroup } from "@/lib/api/groups-detail-endpoints";
import { buildGroupMetadata } from "@/lib/og/group-metadata";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * generateMetadata — OG / Twitter-card tags for a pasted /communities/[slug]
 * link. Shared builder (anon public fetch, no manual og:image — the
 * opengraph-image.tsx convention route owns it). See group-metadata.ts.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildGroupMetadata({
    slug,
    pathPrefix: "/communities",
    kindLabel: "Community",
  });
}

export default async function CommunityStreamPage({ params }: PageProps) {
  const { slug } = await params;

  const session = await getServerSession(authOptions);
  const token = tokenFromSession(session);

  let group;
  try {
    group = await getGroup(slug, token);
  } catch (err) {
    if (err instanceof BccApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <GroupDetailShell
      group={group}
      initialTab="stream"
      urlBase={`/communities/${slug}`}
      sharePath={`/communities/${encodeURIComponent(slug)}`}
      backHref="/communities"
      backLabel="Communities"
    />
  );
}
