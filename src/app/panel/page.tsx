/**
 * /panel — server-component shell wrapping the client PanelQueue.
 *
 * §D5 panelist surface. Mirrors /watching's auth-probe pattern: server-
 * side `getServerSession` with a 307 to /login on unauth. The actual
 * queue + vote flow lives in the client component because the panelist
 * may cast votes that need optimistic invalidation of the queue.
 *
 * No additional gate beyond auth — the server returns an empty array
 * for users not currently on any panel, and the client renders an
 * empty-state when items.length === 0. Showing "you're not a panelist"
 * is a runtime determination, not a route gate.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PanelQueue } from "@/components/disputes/PanelQueue";
import { authOptions } from "@/lib/auth";

export default async function PanelPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/panel");
  }

  return <PanelQueue />;
}