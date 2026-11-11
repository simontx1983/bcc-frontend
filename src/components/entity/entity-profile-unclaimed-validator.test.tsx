/**
 * EntityProfile drops the Vouch / Back / Report cluster for a never-
 * claimed validator (messaging.destination "queue", not is_claimed) and
 * keeps the Message CTA. Claimed validators and other kinds keep it.
 *
 * Every child surface is stubbed: this pins EntityProfile's own wiring,
 * not the children.
 */

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

function stub(name: string) {
  function Stub() {
    return <div data-testid={name} />;
  }
  Stub.displayName = `Stub(${name})`;
  return Stub;
}

vi.mock("@/components/cards/CardFactory", () => ({ CardFactory: stub("card") }));
vi.mock("@/components/common/ShareButton", () => ({ ShareButton: stub("share") }));
vi.mock("@/components/entity/ChainTabs", () => ({ ChainTabs: stub("chains") }));
vi.mock("@/components/claim/ClaimCallout", () => ({ ClaimCallout: stub("claim") }));
vi.mock("@/components/disputes/DisputeCallout", () => ({ DisputeCallout: stub("dispute") }));
vi.mock("@/components/endorse/EndorseButton", () => ({ EndorseButton: stub("endorse") }));
vi.mock("@/components/announcements/AnnouncementBar", () => ({ AnnouncementBar: stub("abar") }));
vi.mock("@/components/announcements/AnnouncementsTopSection", () => ({
  AnnouncementsTopSection: stub("atop"),
}));
vi.mock("@/components/entity/panels/PageStreamPanel", () => ({ PageStreamPanel: stub("pstream") }));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("@/components/announcements/AnnouncementsPanel", () => ({
  AnnouncementsPanel: stub("apanel"),
}));
vi.mock("@/components/entity/EntityTabs", () => ({
  EntityTabs: ({ backingPanel }: { backingPanel?: React.ReactNode }) => (
    <div data-testid="tabs">{backingPanel}</div>
  ),
}));
vi.mock("@/components/entity/panels/CardReviewsPanel", () => ({
  CardReviewsPanel: stub("reviews"),
}));
vi.mock("@/components/entity/panels/CardWatchersPanel", () => ({
  CardWatchersPanel: stub("watchers"),
}));
vi.mock("@/components/entity/LockedStreamPanel", () => ({ LockedStreamPanel: stub("locked") }));
vi.mock("@/components/layout/FileRail", () => ({ FileRail: stub("rail") }));
vi.mock("@/components/layout/PageHero", () => ({
  PageHero: ({ card, actions }: { card: ReactNode; actions: ReactNode }) => (
    <div>
      {card}
      {actions}
    </div>
  ),
}));
vi.mock("@/components/messages/MessageValidatorButton", () => ({
  MessageValidatorButton: stub("message-validator"),
}));
vi.mock("@/components/profile/AttestationActionCluster", () => ({
  AttestationActionCluster: stub("attestation-cluster"),
}));
vi.mock("@/components/profile/AttestationRoster", () => ({
  AttestationRoster: ({ emptyState }: { emptyState?: { body?: string } }) => (
    <div data-testid="roster">{emptyState?.body}</div>
  ),
}));
vi.mock("@/components/profile/ReputationSummaryPanel", () => ({
  ReputationSummaryPanel: stub("reputation"),
}));
vi.mock("@/components/review/ReviewCallout", () => ({ ReviewCallout: stub("review") }));

const { EntityProfile } = await import("@/components/entity/EntityProfile");

afterEach(cleanup);

function card(overrides: Record<string, unknown>) {
  return {
    id: 77,
    name: "Anvil Validator",
    handle: "anvil",
    card_kind: "validator",
    is_claimed: true,
    claim_target: null,
    trust_score: 50,
    reputation_tier: "neutral",
    flags: [],
    stats: [],
    social_proof: null,
    announcements: null,
    viewer_attestation: null,
    viewer_has_endorsed: false,
    viewer_has_reviewed: false,
    endorse_unlock_hint: null,
    permissions: {
      can_vouch: { allowed: true, unlock_hint: null },
      can_stand_behind: { allowed: true, unlock_hint: null },
      can_report: { allowed: true, unlock_hint: null },
    },
    links: { self: "/v/anvil" },
    ...overrides,
  } as never;
}

function renderProfile(c: never) {
  return render(
    <EntityProfile
      card={c}
      kindLabel="VALIDATOR"
      streamEmptyState={{ title: "", body: "" }}
      viewerAuthed
    />,
  );
}

describe("EntityProfile attestation cluster", () => {
  it("is not rendered for a never-claimed validator; Message stays", () => {
    renderProfile(card({ messaging: { destination: "queue", operator: null } }));
    expect(screen.queryByTestId("attestation-cluster")).toBeNull();
    expect(screen.getByTestId("message-validator")).not.toBeNull();
  });

  it("is rendered for a claimed validator", () => {
    renderProfile(card({ messaging: { destination: "operator", operator: null } }));
    expect(screen.getByTestId("attestation-cluster")).not.toBeNull();
  });

  it("is rendered for a non-validator page even with a queue-shaped block", () => {
    renderProfile(
      card({ card_kind: "project", messaging: { destination: "queue", operator: null } }),
    );
    expect(screen.getByTestId("attestation-cluster")).not.toBeNull();
  });
});


describe("EntityProfile Backing empty state", () => {
  it("on a never-claimed validator explains the queue instead of inviting a vouch", () => {
    renderProfile(card({ messaging: { destination: "queue", operator: null } }));
    const roster = screen.getByTestId("roster");
    expect(roster.textContent).toBe(
      "This validator hasn't been claimed yet. You can watch it or send a message, and it'll be delivered when the operator claims the page.",
    );
    expect(roster.textContent).not.toMatch(/first to vouch/i);
  });

  it("on a claimed validator keeps the original copy", () => {
    renderProfile(card({ messaging: { destination: "operator", operator: null } }));
    expect(screen.getByTestId("roster").textContent).toBe(
      "No attestations on file yet. Be the first to vouch.",
    );
  });
});
