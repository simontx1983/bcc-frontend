/**
 * /disputes — the unified §D5 dispute room.
 *
 * Server-component shell wrapping the client <DisputesRoom>. Auth
 * gate mirrors /panel: unauthenticated viewers get redirected to
 * /login with /disputes as the callback. The actual tabs + queues
 * live in the client component because tab state is URL-synced and
 * the lists run live mutations (cast vote / refresh).
 *
 * /panel remains as a dedicated panelist-only surface — both routes
 * share the underlying React Query cache so a panel vote on one page
 * shows up immediately on the other.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DisputesRoom } from "@/components/disputes/DisputesRoom";
import { authOptions } from "@/lib/auth";

export default async function DisputesPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/disputes");
  }

  return <DisputesRoom />;
}