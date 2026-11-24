/**
 * /communities/[slug] — a community's detail page, stream tab (§4.7.5).
 *
 * Every kind lives here, Halls included (Site Structure A): /halls/[slug]
 * forwards to this route. The rendering, the Hall-only additions and the
 * failure handling live in ./community-detail.tsx, shared with the
 * /about and /members sub-routes.
 */

import type { Metadata } from "next";

import { buildGroupMetadata } from "@/lib/og/group-metadata";

import { CommunityDetail } from "./community-detail";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * generateMetadata — OG / Twitter-card tags for a pasted /communities/[slug]
 * link. Shared builder (anon public fetch, no manual og:image — the
 * opengraph-image.tsx convention route owns it). See group-metadata.ts.
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildGroupMetadata({ slug, pathPrefix: "/communities" });
}

export default async function CommunityStreamPage({ params }: PageProps) {
  const { slug } = await params;
  return <CommunityDetail slug={slug} initialTab="stream" />;
}
