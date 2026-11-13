/**
 * /u/[handle]/blogs — the member's full blog list ("SEE ALL N BLOGS" from
 * the About page). Reuses UserBlogList, the read-only list the profile
 * Blog tab's VIEW sub-tab renders. Authoring stays on the Blog tab.
 */

import type { Metadata, Route } from "next";

import { UserBlogList } from "@/components/blog/UserBlogList";
import { ProfileUnavailable } from "@/components/errors/ProfileUnavailable";
import { AboutBackLink } from "@/components/profile/about/AboutCard";
import { presentationName } from "@/lib/format";
import { loadMemberSubpage, memberSubpageMetadata } from "@/lib/profile/load-member-subpage";

interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  return memberSubpageMetadata(handle, "blogs", "Blogs by");
}

export default async function MemberBlogsPage({ params }: PageProps) {
  const { handle } = await params;
  const load = await loadMemberSubpage(handle, "blogs");
  if (load.kind === "unavailable") {
    return <ProfileUnavailable reason={load.reason} />;
  }
  const { profile } = load;
  const name = presentationName(profile);
  const aboutHref = `/u/${encodeURIComponent(profile.handle)}/about` as Route;

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-24 pt-4">
      <AboutBackLink href={aboutHref}>Back to about</AboutBackLink>
      <h1
        className="bcc-stencil mt-4 uppercase leading-[0.95] text-bcc-text"
        style={{ fontSize: "clamp(1.75rem, 7vw, 2.5rem)", wordBreak: "break-word" }}
      >
        Blogs by {name}
      </h1>
      <div className="mt-6">
        <UserBlogList handle={profile.handle} />
      </div>
    </div>
  );
}
