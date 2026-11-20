/**
 * /u/[handle]/about/edit — Edit About (Figma "Handoff v1", dev notes
 * 39–41). Owner only:
 *
 *   - anonymous            → /login, coming back here (the /u/me bounce)
 *   - signed-in non-owner  → /u/[handle]/about
 *   - unreadable profile   → /u/[handle]/about, which renders the same
 *                            private/denied/404 states the profile does
 *
 * Same section order as the About page, as editable cards (EditAboutForm).
 * Same 640px column; the extra bottom padding keeps the sticky Cancel /
 * Save bar (and the mobile nav under it) off the last card.
 */

import type { Metadata, Route } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AboutBackLink } from "@/components/profile/about/AboutCard";
import { EditAboutForm } from "@/components/profile/about-edit/EditAboutForm";
import { splitMemberHalls } from "@/components/profile/about/member-halls";
import { authOptions } from "@/lib/auth";
import { loadMemberSubpage } from "@/lib/profile/load-member-subpage";

/** Owner-only working page — nothing here belongs in an index. */
export const metadata: Metadata = {
  title: "Edit About · Blue Collar Crypto",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ handle: string }>;
}

export default async function EditAboutPage({ params }: PageProps) {
  const { handle } = await params;
  const aboutHref = `/u/${encodeURIComponent(handle)}/about` as Route;

  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/u/${encodeURIComponent(handle)}/about/edit`)}` as Route,
    );
  }

  const load = await loadMemberSubpage(handle, "about/edit");
  if (load.kind === "unavailable" || !load.isOwner) {
    redirect(aboutHref);
  }
  const { profile } = load;
  const ownAboutHref = `/u/${encodeURIComponent(profile.handle)}/about` as Route;
  const { halls } = splitMemberHalls(profile.halls);

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-40 pt-4 md:pb-8">
      <AboutBackLink href={ownAboutHref}>Back to about</AboutBackLink>
      <h1
        className="bcc-stencil mt-2 uppercase leading-[0.95] text-bcc-text"
        style={{ fontSize: "clamp(1.75rem, 7vw, 2.5rem)" }}
      >
        Edit About
      </h1>
      <div className="mt-4">
        <EditAboutForm
          handle={profile.handle}
          bio={profile.bio}
          verifications={profile.verifications}
          halls={halls}
          blogTotal={profile.counts.blog_posts_written}
          reviewTotal={profile.counts.reviews_received}
        />
      </div>
    </div>
  );
}
