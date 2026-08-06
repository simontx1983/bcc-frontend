import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes, ReactNode } from "react";

/**
 * Pins the `suppressBodyLink` contract (2026-08-06, restoring the
 * pre-redesign `hideOpenAction` intent): the front face's full-bleed
 * navigation overlay to `card.links.self` renders by default, and is
 * OMITTED on surfaces that pass `suppressBodyLink` — the profile/group
 * hero (the link would loop back to the page the viewer is on) and the
 * onboarding wizard (a body mis-click would exit the flow).
 */

// The action bar mounts React Query mutations and the crest mounts
// next/image + the app router (avatar upload) — all irrelevant to the
// overlay contract under test.
vi.mock("@/components/cards/CardActionBar", () => ({
  ActionBar: () => null,
  CommunityActionBar: () => null,
}));
vi.mock("@/components/cards/Crest", () => ({
  Crest: () => null,
}));
// Transitive module-load requirements only (the typed API client reads
// clientEnv at import; hook imports pull next-auth/react). Nothing in
// this test executes either.
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
  getSession: async () => null,
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: { href: unknown; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));

import { CardFrontFace } from "@/components/cards/CardFrontFace";
import type { Card, CardPermissionEntry } from "@/lib/api/types";

const denied = (): CardPermissionEntry => ({
  allowed: false,
  unlock_hint: null,
  reason_code: null,
});

function makeCard(): Card {
  return {
    id: 42,
    name: "Anvil Validator",
    handle: "anvil",
    card_kind: "validator",
    bio: "",
    trust_score: 50,
    reputation_tier: "neutral",
    reputation_tier_label: "Neutral",
    rank_label: null,
    is_in_good_standing: true,
    flags: [],
    is_claimed: false,
    claim_target: null,
    chains: null,
    viewer_has_reviewed: false,
    viewer_has_endorsed: false,
    endorse_unlock_hint: null,
    crest: {
      initials: "AV",
      monogram_color: "#8a8a8a",
      background_kind: "tier",
      background_value: "neutral",
      image_url: null,
    },
    stats: [],
    member_dossier: null,
    community_dossier: null,
    permissions: {
      can_review: denied(),
      can_watch: denied(),
      can_endorse: denied(),
      can_post_as_entity: false,
      can_edit_bio: false,
      can_edit_image: denied(),
    },
    social_proof: null,
    links: { self: "/v/anvil" },
  };
}

function renderFace(suppressBodyLink: boolean) {
  return render(
    <CardFrontFace
      card={makeCard()}
      kindColor="var(--kind-validator)"
      flipped={false}
      onFlip={() => {}}
      isPulled={false}
      canEditAvatar={false}
      suppressBodyLink={suppressBodyLink}
    />,
  );
}

describe("CardFrontFace body-link overlay", () => {
  // Vitest runs without global test APIs, so RTL's auto-cleanup doesn't fire.
  afterEach(() => {
    cleanup();
  });

  it("renders the navigation overlay to links.self by default", () => {
    renderFace(false);
    const link = screen.getByRole("link", { name: "Open Anvil Validator" });
    expect(link.getAttribute("href")).toBe("/v/anvil");
  });

  it("omits the overlay when suppressBodyLink is set", () => {
    renderFace(true);
    expect(screen.queryByRole("link", { name: "Open Anvil Validator" })).toBeNull();
  });
});
