/**
 * /communities/[slug]/members — community detail with the Members tab
 * pre-activated.
 *
 * Same shape as the parent route + the /about sibling (all three render
 * ./community-detail.tsx, Halls included) — `initialTab="members"` is the
 * only difference. Route persists for SEO + external deeplinks (PeepSo's
 * native /members/ segment links here directly).
 *
 * Roster gating + member-visible privacy is handled inside
 * `GroupMembersStrip` (which the shell mounts in the Members tab slot)
 * — no per-page branching needed here.
 */

import { CommunityDetail } from "../community-detail";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CommunityMembersPage({ params }: PageProps) {
  const { slug } = await params;
  return <CommunityDetail slug={slug} initialTab="members" />;
}
