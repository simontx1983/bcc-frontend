/**
 * /u/me — resolve "my profile" to the signed-in operator's own handle.
 *
 * The canonical landing target for owner-scoped deep links: anything that
 * wants "the viewer's own profile, on tab X" can point at
 * `/u/me?tab=<key>` without knowing the handle. This is what the retired
 * `/settings/*` URLs redirect to as the settings surface migrates into
 * owner-gated tabs on the profile page.
 *
 * Static segment, so it always wins over the sibling dynamic `[handle]`
 * route. No collision risk either way: handles are 3–20 chars, so "me"
 * can never be claimed as a real handle.
 *
 * Anonymous visitors bounce through login and come back to the same tab.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function MyProfileRedirectPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const rawTab = params["tab"];
  const tab = Array.isArray(rawTab) ? rawTab[0] : rawTab;
  // Carry the requested tab through the redirect so a deep link keeps
  // its destination. Only the `tab` key survives — nothing else here is
  // meaningful on the profile page.
  const query = typeof tab === "string" && tab !== "" ? `?tab=${encodeURIComponent(tab)}` : "";

  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect(`/login?callbackUrl=${encodeURIComponent(`/u/me${query}`)}`);
  }

  redirect(`/u/${session.user.handle}${query}`);
}
