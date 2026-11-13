/**
 * Shared server-side read for the /u/[handle] sub-pages (/about, /blogs,
 * /reviews). Mirrors the profile page's read-failure split exactly, so a
 * hidden, private, suspended or blocked member behaves the same on every
 * URL under /u/[handle]:
 *
 *   404                          -> notFound()
 *   403 + reason profile_private -> { kind: "unavailable", reason: "private" }
 *   any other 403                -> { kind: "unavailable", reason: "denied" }
 *   anything else                -> rethrown to the segment's error.tsx
 *
 * A retired handle 308s to the current one, keeping the sub-path. Anon
 * reads share the 60s Data-Cache entry; authed reads stay uncached.
 */

import type { Metadata, Route } from "next";
import { getServerSession, type Session } from "next-auth";
import { notFound, permanentRedirect } from "next/navigation";

import { authOptions } from "@/lib/auth";
import { ANON_SSR_REVALIDATE_SECONDS } from "@/lib/api/cache-policy";
import { tokenFromSession } from "@/lib/api/client";
import { isProfilePrivate } from "@/lib/api/errors";
import { getUser } from "@/lib/api/user-endpoints";
import { BccApiError, type MemberProfile } from "@/lib/api/types";
import { presentationName } from "@/lib/format";
import { canonicalProfilePath } from "@/lib/seo/canonical-profile-path";
import { isIndexableEnvironment, isIndexableProfile } from "@/lib/seo/indexing";

export type MemberSubpage = "about" | "blogs" | "reviews";

export type MemberSubpageLoad =
  | {
      kind: "ok";
      profile: MemberProfile;
      session: Session | null;
      isOwner: boolean;
    }
  | { kind: "unavailable"; reason: "private" | "denied" };

export async function loadMemberSubpage(
  handle: string,
  subpage: MemberSubpage,
): Promise<MemberSubpageLoad> {
  const session = await getServerSession(authOptions);
  const token = tokenFromSession(session);

  let profile: MemberProfile;
  try {
    profile = await getUser(
      handle,
      token,
      token === null ? { revalidate: ANON_SSR_REVALIDATE_SECONDS } : undefined,
    );
  } catch (err) {
    if (err instanceof BccApiError && err.status === 404) {
      notFound();
    }
    if (isProfilePrivate(err)) {
      return { kind: "unavailable", reason: "private" };
    }
    if (err instanceof BccApiError && err.status === 403) {
      return { kind: "unavailable", reason: "denied" };
    }
    throw err;
  }

  // Outside the try: permanentRedirect throws by design.
  const canonical = canonicalProfilePath(handle, profile.handle);
  if (canonical !== null) {
    permanentRedirect(`${canonical}/${subpage}` as Route);
  }

  return {
    kind: "ok",
    profile,
    session,
    isOwner: session !== null && session.user.handle === profile.handle,
  };
}

/**
 * Metadata for a sub-page, on the same anon read and the same two
 * fail-closed index gates as the profile page.
 */
export async function memberSubpageMetadata(
  handle: string,
  subpage: MemberSubpage,
  titlePrefix: string,
): Promise<Metadata> {
  let profile: MemberProfile;
  try {
    profile = await getUser(handle, null, {
      revalidate: ANON_SSR_REVALIDATE_SECONDS,
    });
  } catch (err) {
    return {
      title: isProfilePrivate(err)
        ? "Private profile · Blue Collar Crypto"
        : "Profile not found · Blue Collar Crypto",
    };
  }

  const name = presentationName(profile);
  const title = `${titlePrefix} ${name}`;
  const bio = profile.bio.trim();
  const description =
    bio !== ""
      ? bio
      : `${name} on the Floor — trust, identity, and reputation for crypto operators.`;
  const canonical = `/u/${encodeURIComponent(profile.handle)}/${subpage}`;
  const indexable =
    isIndexableEnvironment() && isIndexableProfile(profile.flags);

  return {
    title,
    description,
    alternates: { canonical },
    ...(indexable ? {} : { robots: { index: false, follow: false } }),
    openGraph: { title, description, url: canonical, type: "profile" },
    twitter: { card: "summary", title, description },
  };
}
