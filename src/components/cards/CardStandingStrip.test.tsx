import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CardStandingStrip } from "@/components/cards/CardStandingStrip";
import type { Card, CardPermissionEntry } from "@/lib/api/types";

/**
 * Pins the tier rung added 2026-08-06 (contract §3.2:
 * `reputation_tier_label` is populated on entity cards precisely so a
 * surface can warn — the strip is where an entity card says it):
 *
 *   - risky/caution entity → the server label renders VERBATIM with the
 *     alarm treatment, outranked only by a true alarm,
 *   - other tiers → plain identity fact, and only as the final fallback
 *     (an identity row like "Claimed & verified" still wins),
 *   - member cards NEVER render the rung — the header RankChip already
 *     carries the tier, and a second display is the duplication the
 *     strip exists to remove.
 */

const denied = (): CardPermissionEntry => ({
  allowed: false,
  unlock_hint: null,
  reason_code: null,
});

function makeCard(overrides: Partial<Card> = {}): Card {
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
    ...overrides,
  };
}

function renderStrip(card: Card) {
  return render(
    <CardStandingStrip
      card={card}
      kindColor="var(--kind-validator)"
      flipped={false}
      onFlip={() => {}}
    />,
  );
}

describe("CardStandingStrip tier rung", () => {
  // Vitest runs without global test APIs, so RTL's auto-cleanup doesn't fire.
  afterEach(() => {
    cleanup();
  });

  it("renders a risky entity's server label verbatim with the alarm treatment", () => {
    renderStrip(
      makeCard({ reputation_tier: "risky", reputation_tier_label: "Risky" }),
    );
    const row = screen.getByText("Risky").closest(".bcc-card-standing-row");
    expect(row).not.toBeNull();
    expect(row?.getAttribute("data-tone")).toBe("alarm");
  });

  it("renders a caution entity's label with the alarm treatment", () => {
    renderStrip(
      makeCard({ reputation_tier: "caution", reputation_tier_label: "Caution" }),
    );
    const row = screen.getByText("Caution").closest(".bcc-card-standing-row");
    expect(row?.getAttribute("data-tone")).toBe("alarm");
  });

  it("lets a true alarm outrank the tier warning", () => {
    renderStrip(
      makeCard({
        reputation_tier: "risky",
        reputation_tier_label: "Risky",
        flags: ["suspended"],
      }),
    );
    expect(screen.getByText("Suspended")).toBeDefined();
    expect(screen.queryByText("Risky")).toBeNull();
  });

  it("renders a non-warning tier as an identity fact when nothing else resolves", () => {
    renderStrip(
      makeCard({ reputation_tier: "trusted", reputation_tier_label: "Trusted" }),
    );
    const row = screen.getByText("Trusted").closest(".bcc-card-standing-row");
    expect(row?.getAttribute("data-tone")).toBe("identity");
  });

  it("keeps the identity row ahead of the tier fact (claimed entity)", () => {
    renderStrip(
      makeCard({
        reputation_tier: "trusted",
        reputation_tier_label: "Trusted",
        is_claimed: true,
      }),
    );
    expect(screen.getByText("Claimed & verified")).toBeDefined();
    expect(screen.queryByText("Trusted")).toBeNull();
  });

  it("never renders the rung on a member card (RankChip owns the tier there)", () => {
    renderStrip(
      makeCard({
        card_kind: "member",
        reputation_tier: "risky",
        reputation_tier_label: "Risky",
        rank_label: "Journeyman",
      }),
    );
    expect(screen.queryByText("Risky")).toBeNull();
    // The strip still renders its flip chip — the rung is what's absent.
    expect(screen.getByRole("button")).toBeDefined();
  });
});
