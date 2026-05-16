/**
 * /communities/[slug]/about — community detail with the About tab
 * pre-activated.
 *
 * Thin shell over `GroupDetailShell`. Same data + tabs as the parent
 * route; only `initialTab` differs. Route stays for SEO + external
 * deeplinks (the standalone URL is the canonical landing target for
 * "what is this community" link-outs).
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

export default async function CommunityAboutPage({ params }: PageProps) {
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
      initialTab="about"
      urlBase={`/communities/${slug}`}
      backHref="/communities"
      backLabel="Communities"
    />
  );
}
