/**
 * /communities/[slug]/about — community detail with the About tab
 * pre-activated.
 *
 * Same data + tabs as the parent route (./community-detail.tsx, shared by
 * all three routes, Halls included); only `initialTab` differs. Route
 * stays for SEO + external deeplinks (the standalone URL is the canonical
 * landing target for "what is this community" link-outs).
 */

import { CommunityDetail } from "../community-detail";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CommunityAboutPage({ params }: PageProps) {
  const { slug } = await params;
  return <CommunityDetail slug={slug} initialTab="about" />;
}
