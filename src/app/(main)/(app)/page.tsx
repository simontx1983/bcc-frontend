/**
 * Home — the Floor.
 *
 * Authed only — middleware rewrites anon `/` to the (marketing) landing
 * before this ever renders (Item 7), so there's no anon branch here
 * anymore: personal "shift briefing" (greeting + §O3 status block via
 * FloorBriefing) → Composer → FeedView. Dense and operational, not a
 * marketing surface — that's `/welcome`'s job now.
 *
 * The FeedView component is `"use client"` (state, infinite query,
 * mutations) — only `isAuthenticated` (a boolean) crosses the RSC
 * boundary, the same boundary discipline as <OnboardingWizard>.
 *
 * `?compose=1` deep link: NewPostTrigger sends signed-out viewers to
 * /login?callbackUrl=/?compose=1 — on successful sign-in they land
 * back here with the composer pre-expanded instead of the idle
 * collapsed row. Sign-up doesn't thread callbackUrl through, so
 * brand-new members never see this (see NewPostTrigger's doc comment).
 */

import { getServerSession } from "next-auth";

import { Composer } from "@/components/composer/Composer";
import { FeedView } from "@/components/feed/FeedView";
import { FloorBriefing } from "@/components/landing/FloorBriefing";
import { TourAutoStart } from "@/components/tour/TourAutoStart";
import { getUser } from "@/lib/api/user-endpoints";
import type { CardTier, MemberProfile } from "@/lib/api/types";
import { authOptions } from "@/lib/auth";

interface PageProps {
  // Next 15 App Router: searchParams is async per the routes contract.
  searchParams: Promise<{ compose?: string }>;
}

export default async function HomePage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  const isAuthenticated = session !== null;
  const { compose } = await searchParams;

  // Authed viewers see their own §O3 living-status block. Fetched here
  // so the briefing can SSR alongside the page; FloorBriefing falls
  // back to a bare greeting when the fetch fails.
  let viewerProfile: MemberProfile | null = null;
  if (isAuthenticated) {
    try {
      viewerProfile = await getUser(session.user.handle, session.bccToken ?? null);
    } catch {
      viewerProfile = null;
    }
  }

  // §C1 identity-header fields for the Composer's collapsed-card avatar
  // + RankChip — the same derivation the old FloorBriefing IdentityRow used.
  const cardTier: CardTier = viewerProfile?.card_tier ?? null;
  const tierLabel: string | null =
    typeof viewerProfile?.tier_label === "string" && viewerProfile.tier_label !== ""
      ? viewerProfile.tier_label
      : null;
  const rankLabel =
    typeof viewerProfile?.rank_label === "string" && viewerProfile.rank_label !== ""
      ? viewerProfile.rank_label
      : "";

  return (
    <main className="min-h-screen pb-24">
      {/* First-visit walkthrough of the Floor. Self-guards: won't fire if
          already seen, or if another tour is running. */}
      {isAuthenticated && <TourAutoStart tourId="home-feed" />}

      {isAuthenticated && (
        <>
          <FloorBriefing profile={viewerProfile} />

          {/* §D1 composer — auth-only inline status form. v1.5 quiet
              idle row; expands on click. Long-form lives on the
              author's blog tab CREATE sub-tab. Tagged for the home-feed
              tour's posting step — this box is present on mobile AND
              desktop (unlike the sidebar trigger). */}
          <div data-bcc-tour="composer.box">
          <Composer
            viewerAvatarUrl={viewerProfile?.avatar_url}
            viewerHandle={session.user.handle}
            viewerDisplayName={viewerProfile?.display_name ?? null}
            viewerCardTier={cardTier}
            viewerTierLabel={tierLabel}
            viewerRankLabel={rankLabel}
            startExpanded={compose === "1"}
          />
          </div>
        </>
      )}

      <FeedView isAuthenticated={isAuthenticated} />
    </main>
  );
}
