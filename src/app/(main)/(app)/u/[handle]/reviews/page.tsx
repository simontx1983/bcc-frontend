/**
 * /u/[handle]/reviews — every review filed ABOUT the member ("SEE ALL N
 * REVIEWS" from the About page). Reuses CardReviewsPanel in its
 * `user_profile` mode — the same panel the profile's Reviews Received tab
 * mounts. Each row carries id="review-{id}" so About's links land on it.
 */

import type { Metadata, Route } from "next";

import { CardReviewsPanel } from "@/components/entity/panels/CardReviewsPanel";
import { ProfileUnavailable } from "@/components/errors/ProfileUnavailable";
import { AboutBackLink } from "@/components/profile/about/AboutCard";
import { ScrollToHashOnArrival } from "@/components/profile/about/ScrollToHashOnArrival";
import { REVIEW_TAB_COPY } from "@/lib/copy/trust-layer";
import { presentationName } from "@/lib/format";
import { loadMemberSubpage, memberSubpageMetadata } from "@/lib/profile/load-member-subpage";

interface PageProps {
  params: Promise<{ handle: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { handle } = await params;
  return memberSubpageMetadata(handle, "reviews", "Reviews of");
}

export default async function MemberReviewsPage({ params }: PageProps) {
  const { handle } = await params;
  const load = await loadMemberSubpage(handle, "reviews");
  if (load.kind === "unavailable") {
    return <ProfileUnavailable reason={load.reason} />;
  }
  const { profile } = load;
  const name = presentationName(profile);
  const aboutHref = `/u/${encodeURIComponent(profile.handle)}/about` as Route;

  return (
    <div className="mx-auto w-full max-w-[640px] px-4 pb-24 pt-4">
      <AboutBackLink href={aboutHref}>Back to about</AboutBackLink>
      <p className="bcc-mono mt-4 text-[10px] uppercase tracking-[0.18em] text-bcc-text-secondary">
        {REVIEW_TAB_COPY.received}
      </p>
      <h1
        className="bcc-stencil mt-1 uppercase leading-[0.95] text-bcc-text"
        style={{ fontSize: "clamp(1.75rem, 7vw, 2.5rem)", wordBreak: "break-word" }}
      >
        Reviews of {name}
      </h1>
      <div className="mt-6">
        <CardReviewsPanel kind="user_profile" cardId={profile.user_id} cardName={name} />
      </div>
      <ScrollToHashOnArrival />
    </div>
  );
}
