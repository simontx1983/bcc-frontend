/**
 * /communities/[slug]/members — community detail with the Members tab
 * pre-activated.
 *
 * Thin shell over `GroupDetailShell`. Same shape as the parent route +
 * the /about sibling — `initialTab="members"` is the only difference.
 * Route persists for SEO + external deeplinks (PeepSo's native
 * /members/ segment links here directly).
 *
 * Roster gating + member-visible privacy is handled inside
 * `GroupMembersStrip` (which the shell mounts in the Members tab slot)
 * — no per-page branching needed here.
 */

import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { GroupDetailShell } from "@/components/groups/GroupDetailShell";
import { authOptions } from "@/lib/auth";
import { getGroup } from "@/lib/api/groups-detail-endpoints";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function CommunityMembersPage({ params }: PageProps) {
  const { slug } = await params;

  const session = await getServerSession(authOptions);
  const token = session?.bccToken ?? null;

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
      initialTab="members"
      urlBase={`/communities/${slug}`}
      backHref="/communities"
      backLabel="Communities"
    />
  );
}
