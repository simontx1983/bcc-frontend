/**
 * /notifications — full-page notification list.
 *
 * The bell modal's "See all" link (SiteHeader) pointed here since §I1,
 * but the route never existed — every click 404'd (found by the
 * 2026-07-23 member-reviews smoke). Server-component shell wrapping
 * the shared client NotificationsPanel — same auth-probe pattern as
 * /watching: `getServerSession` with a 307 to /login on unauth, so
 * there's no loading-flash + bounce.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { NotificationsPageBody } from "@/components/notifications/NotificationsPageBody";
import { authOptions } from "@/lib/auth";

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/notifications");
  }

  return <NotificationsPageBody />;
}
