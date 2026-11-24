/**
 * Structure A row 17: a card's cover photo. With `cover_photo_url` the
 * portrait shows the photo (under a light shade) in place of the halftone;
 * absent (today's backend), null, blank or not http(s) → the halftone, as
 * today. A cover that fails to load falls back to the halftone.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes, ReactNode } from "react";

vi.mock("@/components/cards/CardActionBar", () => ({ ActionBar: () => null, CommunityActionBar: () => null }));
vi.mock("@/components/cards/Crest", () => ({ Crest: () => <span data-testid="crest" /> }));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
  getSession: async () => null,
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: unknown; children?: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={String(href)} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/image", () => ({
  default: ({ src, alt, onError }: { src: string; alt: string; onError?: () => void }) => (
    <img data-next-image="" src={src} alt={alt} onError={onError} />
  ),
}));

import { CardFrontFace } from "@/components/cards/CardFrontFace";
import type { Card, CardPermissionEntry } from "@/lib/api/types";

const denied = (): CardPermissionEntry => ({ allowed: false, unlock_hint: null, reason_code: null });

function makeCard(over: Partial<Card> = {}): Card {
  return {
    id: 42,
    name: "Leo Stakes",
    handle: "leo",
    card_kind: "member",
    bio: "",
    trust_score: 72,
    reputation_tier: "trusted",
    reputation_tier_label: "Trusted",
    rank_label: null,
    is_in_good_standing: true,
    flags: [],
    is_claimed: true,
    claim_target: null,
    chains: null,
    viewer_has_reviewed: false,
    viewer_has_endorsed: false,
    endorse_unlock_hint: null,
    crest: { initials: "LS", monogram_color: "#8a8a8a", background_kind: "tier", background_value: "trusted", image_url: null },
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
    links: { self: "/u/leo" },
    ...over,
  } as Card;
}

const face = (card: Card) =>
  render(
    <CardFrontFace card={card} kindColor="var(--kind-member)" flipped={false} onFlip={() => {}} isPulled={false} canEditAvatar={false} />,
  );

afterEach(cleanup);

describe("card cover photo", () => {
  it("today's backend (no cover field): the halftone, no cover", () => {
    const card = makeCard();
    delete (card as { cover_photo_url?: unknown }).cover_photo_url;
    face(card);
    expect(screen.getByTestId("card-halftone")).toBeInTheDocument();
    expect(screen.queryByTestId("card-cover")).toBeNull();
    expect(screen.getByTestId("crest")).toBeInTheDocument();
  });

  it("null, blank or a non-http value: the halftone", () => {
    for (const value of [
      null,
      "",
      "   ",
      "javascript:alert(1)",
      "/uploads/cover.jpg",
      "data:image/png;base64,AAAA",
      // https only: an http image is mixed content on the https site.
      "http://cdn.example.test/cover.jpg",
    ]) {
      face(makeCard({ cover_photo_url: value }));
      expect(screen.getByTestId("card-halftone"), String(value)).toBeInTheDocument();
      expect(screen.queryByTestId("card-cover"), String(value)).toBeNull();
      cleanup();
    }
  });

  it("a cover replaces the halftone, decorative, with the crest still on top", () => {
    face(makeCard({ cover_photo_url: "https://cdn.example.test/cover.jpg" }));
    const cover = screen.getByTestId("card-cover");
    expect(cover).toHaveAttribute("aria-hidden");
    const img = cover.querySelector("img");
    expect(img).toHaveAttribute("src", "https://cdn.example.test/cover.jpg");
    expect(img).toHaveAttribute("alt", "");
    expect(screen.queryByTestId("card-halftone")).toBeNull();
    // The crest renders after the cover, so it paints above it.
    const crest = screen.getByTestId("crest");
    expect(cover.compareDocumentPosition(crest) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("a WordPress-hosted cover goes through next/image", () => {
    face(makeCard({ cover_photo_url: "https://wp.example/wp-content/uploads/2026/11/cover.jpg" }));
    const img = screen.getByTestId("card-cover").querySelector("img");
    expect(img).toHaveAttribute("data-next-image");
    expect(img).toHaveAttribute("src", "https://wp.example/wp-content/uploads/2026/11/cover.jpg");
  });

  it("a WordPress-hosted cover that fails to load falls back to the halftone too", () => {
    face(makeCard({ cover_photo_url: "https://wp.example/wp-content/uploads/2026/11/gone.jpg" }));
    const img = screen.getByTestId("card-cover").querySelector("img");
    expect(img).toHaveAttribute("data-next-image");
    fireEvent.error(img as HTMLImageElement);
    expect(screen.getByTestId("card-halftone")).toBeInTheDocument();
    expect(screen.queryByTestId("card-cover")).toBeNull();
  });

  it("a cover that fails to load falls back to the halftone", () => {
    face(makeCard({ cover_photo_url: "https://cdn.example.test/broken.jpg" }));
    const img = screen.getByTestId("card-cover").querySelector("img");
    expect(img).not.toBeNull();
    fireEvent.error(img as HTMLImageElement);
    expect(screen.getByTestId("card-halftone")).toBeInTheDocument();
  });
});
