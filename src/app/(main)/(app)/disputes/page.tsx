/**
 * /disputes — the dispute room (open community voting, Rank Phase 6).
 *
 * Server-component shell wrapping the client <DisputesRoom>.
 * Unauthenticated viewers get redirected to /login with /disputes as
 * the callback. The case list lives in the client component because
 * it runs live queries against /disputes/mine; ballots are cast on the
 * per-case detail surface (/disputes/[id]).
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { DisputesRoom } from "@/components/disputes/DisputesRoom";
import { TourAutoStart } from "@/components/tour/TourAutoStart";
import { authOptions } from "@/lib/auth";

export default async function DisputesPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/disputes");
  }

  return (
    <>
      <TourAutoStart tourId="disputes" />
      <DisputesRoom />
    </>
  );
}