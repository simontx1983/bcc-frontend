/**
 * Home — the Floor.
 *
 * Server component. Reads the session to decide which branch to render:
 *
 *   - Authenticated → personal "shift briefing" (greeting + §O3 status
 *     block via FloorBriefing) → HighlightStrip → Composer → FeedView.
 *     The home for logged-in users is a daily driver — dense and
 *     operational, not a marketing surface.
 *
 *   - Anonymous → <FloorIntro /> (manifesto + pillars + loop + demo
 *     card + CTA), then the same FeedView running anon-mode (/feed/hot).
 *
 * Two server-side fetches, both purely cosmetic — failures degrade to
 * a leaner render rather than 500ing the home page:
 *
 *   1. Anon → /bcc/v1/cards (sort=trust) for FloorIntro's demo card.
 *   2. Auth → /bcc/v1/users/:handle for FloorBriefing's status block.
 *
 * The FeedView component is `"use client"` (state, infinite query,
 * mutations) — only `isAuthenticated` (a boolean) crosses the RSC
 * boundary, the same boundary discipline as <OnboardingWizard>.
 */

import { getServerSession } from "next-auth";

import { Composer } from "@/components/composer/Composer";
import { FeedView } from "@/components/feed/FeedView";
import { HighlightStrip } from "@/components/feed/HighlightStrip";
import { FloorBriefing } from "@/components/landing/FloorBriefing";
import { FloorIntro } from "@/components/landing/FloorIntro";
import { getCardsList } from "@/lib/api/cards-list-endpoints";
import { getUser } from "@/lib/api/user-endpoints";
import type { Card, MemberProfile } from "@/lib/api/types";
import { authOptions } from "@/lib/auth";

export default async function HomePage() {
  const session = await getServerSession(authOptions);
  const isAuthenticated = session !== null;

  // Anon visitors see the FloorIntro above the feed. Pull a real card
  // for the §Exhibit-A demo block; null fallback is fine — that block
  // gracefully omits if no card is available.
  let featuredCard: Card | null = null;
  if (!isAuthenticated) {
    try {
      const result = await getCardsList({ sort: "trust", per_page: 1 });
      featuredCard = result.items[0] ?? null;
    } catch {
      featuredCard = null;
    }
  }

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

  return (
    <main className="min-h-screen pb-24">
      {isAuthenticated ? (
        <>
          <FloorBriefing handle={session.user.handle} profile={viewerProfile} />

          {/* §O2 strip — auth-only. Silent-fails on empty/error so it
              never blocks the Floor from rendering. */}
          <HighlightStrip />

          {/* §D1 composer — auth-only inline status form. v1.5 quiet
              idle row; expands on click. Long-form lives on the
              author's blog tab CREATE sub-tab. */}
          <Composer
            viewerAvatarUrl={viewerProfile?.avatar_url}
            viewerHandle={session.user.handle}
            viewerDisplayName={viewerProfile?.display_name ?? null}
          />

        </>
      ) : (
        <FloorIntro featuredCard={featuredCard} />
      )}

      <FeedView isAuthenticated={isAuthenticated} />
    </main>
  );
}
