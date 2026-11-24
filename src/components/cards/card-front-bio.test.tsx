/**
 * Structure A row 16, as Phillip decided it (2026-11-24): the 108px crest
 * stays, and the card's own bio shows under the counts, clamped to the
 * room the portrait can give. The on-chain strip takes that room on a
 * validator card, so the bio there is "tight" (1 line; none on a phone).
 * Every other card is "open" (3 lines; 1 on a phone). No bio → no line,
 * and the back still carries the bio. The clamp numbers themselves are
 * CSS (globals.css .bcc-card-bio), pinned in src/app/card-bio-clamp.test.ts.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes, ReactNode } from "react";

vi.mock("@/components/cards/CardActionBar", () => ({ ActionBar: () => null, CommunityActionBar: () => null }));
vi.mock("@/components/cards/Crest", () => ({ Crest: () => <span data-testid="crest" /> }));
vi.mock("@/components/cards/CardOnchainSignals", () => ({
  OnchainSignalsStrip: () => <div data-testid="onchain-strip" />,
}));
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

import { CardFrontFace } from "@/components/cards/CardFrontFace";
import type { Card, CardPermissionEntry } from "@/lib/api/types";

const denied = (): CardPermissionEntry => ({ allowed: false, unlock_hint: null, reason_code: null });
const BIO = "Delegator turned operator. I write up what broke, what didn't, and why, after every chain upgrade I run.";

function makeCard(over: Partial<Card> = {}): Card {
  return {
    id: 42,
    name: "Leo Stakes",
    handle: "leo",
    card_kind: "member",
    bio: BIO,
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

describe("the card's front bio", () => {
  it("shows the card's own bio, verbatim, in the clamped bio line", () => {
    face(makeCard());
    const bio = screen.getByTestId("card-front-bio");
    expect(bio).toHaveTextContent(BIO);
    expect(bio).toHaveClass("bcc-card-bio");
  });

  it("no bio (or only whitespace) → no line at all", () => {
    for (const bio of ["", "   \n "]) {
      face(makeCard({ bio }));
      expect(screen.queryByTestId("card-front-bio"), JSON.stringify(bio)).toBeNull();
      cleanup();
    }
  });

  it("sits under the counts: after the nameplate, before the on-chain strip", () => {
    face(makeCard({ card_kind: "validator", onchain_signals: {} as NonNullable<Card["onchain_signals"]> }));
    const bio = screen.getByTestId("card-front-bio");
    const strip = screen.getByTestId("onchain-strip");
    expect(bio.compareDocumentPosition(strip) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByText("Leo Stakes").compareDocumentPosition(bio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("with the on-chain strip the room is tight (1 line; none on a phone)", () => {
    face(makeCard({ card_kind: "validator", onchain_signals: {} as NonNullable<Card["onchain_signals"]> }));
    expect(screen.getByTestId("card-front-bio")).toHaveAttribute("data-room", "tight");
  });

  it("without it (members, pages, communities, a validator with no signals) the room is open (3 lines; 1 on a phone)", () => {
    for (const kind of ["member", "project", "creator", "validator"] as const) {
      face(makeCard({ card_kind: kind, onchain_signals: null }));
      expect(screen.getByTestId("card-front-bio"), kind).toHaveAttribute("data-room", "open");
      cleanup();
    }
  });

  it("the back still carries the bio (the front shows only its start)", () => {
    const back = readFileSync(resolve(process.cwd(), "src/components/cards/CardBackFace.tsx"), "utf-8");
    expect(back).toMatch(/card\.bio !== ""[\s\S]{0,900}\{card\.bio\}/);
  });
});
