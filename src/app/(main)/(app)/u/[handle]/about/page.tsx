/**
 * /u/[handle]/about — the member's About page (Figma "Handoff v1",
 * Public Profile / Mobile – About). A single 390px-first column, centred
 * at max-w-[640px] on desktop inside the app shell.
 *
 * Same read and the same failure split as /u/[handle] (see
 * loadMemberSubpage): 404 → notFound, private/denied → ProfileUnavailable,
 * anything else → this segment's error.tsx.
 *
 * Sections, in order, each hidden when it has nothing to show: ABOUT,
 * VERIFICATIONS, HALLS, OPERATOR / PROJECTS (groups only), BLOGS, REVIEWS.
 *
 * SHOW ON PROFILE (Edit About, umbrella #290): a visitor does not get a
 * card whose `profile.sections` flag is false (absent `sections` → all
 * visible). The server sends the owner every flag true, so the owner gets
 * every card and a HIDDEN FROM YOUR PROFILE marker, read from their own
 * prefs, on each one they switched off.
 */

import type { Metadata, Route } from "next";

import { ProfileUnavailable } from "@/components/errors/ProfileUnavailable";
import { TrustHeader } from "@/components/profile/TrustHeader";
import { AboutBackLink } from "@/components/profile/about/AboutCard";
import { AboutBlogsCard } from "@/components/profile/about/AboutBlogsCard";
import { AboutReviewsCard } from "@/components/profile/about/AboutReviewsCard";
import { HiddenFromProfileMarker } from "@/components/profile/about/HiddenFromProfileMarker";
import {
  AboutBioCard,
  AboutGroupsCard,
  AboutHallsCard,
  AboutVerificationsCard,
} from "@/components/profile/about/AboutSections";
import { presentationName } from "@/lib/format";
import { loadMemberSubpage, memberSubpageMetadata } from "@/lib/profile/load-member-subpage";
import { resolveProfileSections, type SectionPrefKey } from "@/lib/profile/profile-sections";
import { splitMemberHalls } from "@/components/profile/about/member-halls";

interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  return memberSubpageMetadata(handle, "about", "About");
}

export default async function MemberAboutPage({ params }: PageProps) {
  const { handle } = await params;
  const load = await loadMemberSubpage(handle, "about");
  if (load.kind === "unavailable") {
    return <ProfileUnavailable reason={load.reason} />;
  }
  const { profile, session, isOwner } = load;
  const name = presentationName(profile);
  const profileHref = `/u/${encodeURIComponent(profile.handle)}` as Route;
  const blogTotal = profile.counts.blog_posts_written;
  const reviewTotal = profile.counts.reviews_received;

  const sections = resolveProfileSections(profile);
  // The typed GROUPS card is headed OPERATOR / PROJECTS, so it sits behind
  // both switches; the untyped (pre-#671) list is plain group membership.
  const { typed } = splitMemberHalls(profile.halls);
  const groupKeys: SectionPrefKey[] = typed
    ? ["show_groups_on_profile", "show_operator_on_profile"]
    : ["show_groups_on_profile"];
  const groupsVisible = sections.halls && (!typed || sections.operator);
  const marker = (keys: SectionPrefKey[]) =>
    isOwner ? <HiddenFromProfileMarker prefKeys={keys} /> : undefined;

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-24 pt-4">
      <AboutBackLink href={profileHref}>Back to profile</AboutBackLink>
      <div className="mt-2">
        <TrustHeader profile={profile} isOwner={isOwner} viewerAuthed={session !== null} />
      </div>
      <h1
        className="bcc-stencil mt-8 uppercase leading-[0.95] text-bcc-text"
        style={{ fontSize: "clamp(1.75rem, 7vw, 2.5rem)", wordBreak: "break-word" }}
      >
        About {name}
      </h1>
      <div className="mt-4 flex flex-col gap-4">
        {(isOwner || sections.about) && (
          <AboutBioCard profile={profile} aside={marker(["show_about_on_profile"])} />
        )}
        {(isOwner || sections.verifications) && (
          <AboutVerificationsCard
            profile={profile}
            aside={marker(["show_verifications_on_profile"])}
          />
        )}
        {(isOwner || sections.halls) && (
          <AboutHallsCard profile={profile} aside={marker(["show_groups_on_profile"])} />
        )}
        {(isOwner || groupsVisible) && (
          <AboutGroupsCard profile={profile} aside={marker(groupKeys)} />
        )}
        {(isOwner || sections.blogs) && blogTotal > 0 && (
          <AboutBlogsCard
            handle={profile.handle}
            total={blogTotal}
            aside={marker(["show_blogs_on_profile"])}
          />
        )}
        {/* Reviews RECEIVED are public (2026-07-22 decision):
            `privacy.reviews_hidden` governs only the reviews-WRITTEN list,
            so it does not gate this card — same as the profile's Reviews
            tab. Hidden only when the count is absent (optional during the
            v1.49 rollout; the card cannot say "N" without it) or zero.
            The SHOW ON PROFILE switch (`sections.reviews`) does gate it. */}
        {(isOwner || sections.reviews) &&
          reviewTotal !== undefined &&
          reviewTotal > 0 && (
            <AboutReviewsCard
              handle={profile.handle}
              userId={profile.user_id}
              total={reviewTotal}
              aside={marker(["show_reviews_on_profile"])}
            />
          )}
      </div>
    </div>
  );
}
