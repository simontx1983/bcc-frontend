/**
 * /disputes/[id] — single-case detail surface for the §D5 dispute system.
 *
 * Server-component shell wrapping the client <DisputeDetail>. Auth gate
 * mirrors /disputes: unauthenticated viewers are redirected to /login
 * with /disputes/{id} as the callback. Param parsing rejects anything
 * that isn't a positive integer at the route boundary so the client
 * component can trust a numeric id.
 *
 * No new endpoint is consumed: the client component finds the row by id
 * inside the existing /disputes/panel and /disputes/mine query caches.
 * That keeps the data contract identical to the list surface and avoids
 * a second round-trip when the user navigates from the list.
 */

import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { DisputeDetail } from "@/components/disputes/DisputeDetail";
import { authOptions } from "@/lib/auth";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DisputeDetailPage({ params }: PageProps) {
  const { id } = await params;

  const numeric = Number.parseInt(id, 10);
  if (!Number.isFinite(numeric) || numeric <= 0 || String(numeric) !== id) {
    notFound();
  }

  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect(`/login?callbackUrl=/disputes/${numeric}`);
  }

  return <DisputeDetail id={numeric} />;
}
