/**
 * Tour registry — the catalogue of contextual tours. Each step points at a
 * stable `data-bcc-tour="feature.name"` target wired into the real UI (see
 * the components under src/components that carry those attributes). Adding a
 * tour is data-only: append a TourDefinition here, drop the matching
 * data-bcc-tour attributes on the target elements, and (optionally) call
 * useAutoStartTour on the surface where it should fire first-visit.
 *
 * Copy register: calm, observational, blue-collar. No hype, no pressure —
 * these explain, they don't nudge.
 */

import type { TourDefinition } from "@/lib/tour/types";

const HOME_FEED: TourDefinition = {
  id: "home-feed",
  label: "The Floor",
  steps: [
    {
      center: true,
      title: "Welcome to the Floor.",
      body: "This is your feed — operators, projects, and creators you watch, plus what the wider floor is signalling. Here's a quick lay of the land.",
    },
    {
      target: '[data-bcc-tour="feed.item"]',
      title: "Every post is on the record.",
      body: "Reviews, vouches, disputes, and posts all land here. Nothing disappears — the chain remembers.",
      placement: "auto",
    },
    {
      target: '[data-bcc-tour="rankchip.trigger"]',
      title: "Rank tells you who's earned it.",
      body: "Tap any rank chip to see how that operator's reputation was built — who backed them, and how reliable those judges are.",
      placement: "auto",
    },
    {
      // The on-feed composer box (present on mobile AND desktop). The
      // sidebar trigger is desktop-only, so targeting the box keeps this
      // step working on every viewport.
      target: '[data-bcc-tour="composer.box"]',
      title: "Say your piece.",
      body: "Post an update, drop a review, or open a dispute from here. Your record starts with your first move.",
      placement: "bottom",
    },
    {
      target: '[data-bcc-tour="nav.watching"]',
      title: "Your watchlist lives here.",
      body: "Everyone you watch is one click away. Add or drop anyone, any time — it shapes what your Floor shows.",
      placement: "right",
    },
  ],
};

const RANKCHIP: TourDefinition = {
  id: "rankchip",
  label: "Reputation",
  steps: [
    {
      target: '[data-bcc-tour="rankchip.trigger"]',
      title: "How reputation reads.",
      body: "The chip is a snapshot: the rank an operator has earned from what others say about them. Tap it for the full breakdown — backing, standing, and history.",
      placement: "auto",
      // Rankchips live on the feed — launch here from anywhere.
      route: "/",
    },
  ],
};

const COMPOSER: TourDefinition = {
  id: "composer",
  label: "Posting",
  steps: [
    {
      target: '[data-bcc-tour="composer.trigger"]',
      title: "Start a post.",
      body: "Share an update, attach media, or link a review. Keep it real — this is a record, not a feed of noise.",
      placement: "auto",
      // The composer trigger sits in the sidebar on the Floor.
      route: "/",
    },
  ],
};

const PROFILE: TourDefinition = {
  id: "profile",
  label: "Your profile",
  steps: [
    {
      target: '[data-bcc-tour="profile.header"]',
      title: "This is your record.",
      body: "Your reputation, reliability, and what you've done on the floor — all in one place. Others see the public side of this.",
      placement: "bottom",
    },
  ],
};

const DISPUTES: TourDefinition = {
  id: "disputes",
  label: "Disputes",
  steps: [
    {
      target: '[data-bcc-tour="disputes.panel"]',
      title: "Disputes get a fair hearing.",
      body: "When an operator's work is contested, it comes here for panel review — evidence in, judgment out. Higher trust unlocks a seat on the panel.",
      placement: "auto",
    },
  ],
};

export const tourRegistry: Record<string, TourDefinition> = {
  [HOME_FEED.id]: HOME_FEED,
  [RANKCHIP.id]: RANKCHIP,
  [COMPOSER.id]: COMPOSER,
  [PROFILE.id]: PROFILE,
  [DISPUTES.id]: DISPUTES,
};
