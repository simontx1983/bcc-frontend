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

import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/lib/auth";

/**
 * Kept out of the index here rather than in robots.txt, because robots.txt
 * matches by PREFIX: a `Disallow: /u/me` rule would also block `/u/mega`,
 * `/u/melissa` and every other handle starting with "me". The `$` end-anchor
 * is a non-standard extension, so a crawler that ignores it would silently
 * under-block instead. Page metadata has none of that ambiguity.
 *
 * This route is a redirect either way — to the owner's profile, or to login —
 * so there is nothing here worth indexing.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

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
