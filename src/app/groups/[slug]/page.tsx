/**
 * /groups/[slug] — single-group detail page.
 *
 * Thin server shell over `GroupDetailShell` (the unified FileRail +
 * PageHero + GroupTabs grammar shared with /communities and /locals).
 *
 * Auth: anon allowed. When a session exists we forward the bearer so
 * the response carries populated `viewer_membership` + `permissions`
 * blocks. Missing slug AND secret-non-member both surface as 404 →
 * Next's `notFound()` (per §S defense-in-depth, the server NEVER
 * distinguishes the two on the wire).
 *
 * Internal-state tabs (no urlBase) — /groups/[slug] is a single URL
 * with no sub-routes. Tab clicks update component state only.
 */

import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";

import { GroupDetailShell } from "@/components/groups/GroupDetailShell";
import { authOptions } from "@/lib/auth";
import { getGroup } from "@/lib/api/groups-detail-endpoints";
import { BccApiError, type GroupDetailResponse } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function GroupDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const session = await getServerSession(authOptions);
  const token = session?.bccToken ?? null;

  let group: GroupDetailResponse;
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
      backHref="/communities"
      backLabel="Groups"
    />
  );
}
