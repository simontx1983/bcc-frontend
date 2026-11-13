/**
 * A delegator community is stored `closed`, but nothing queues behind that:
 * the gate is the delegation the join verifies. Read as plain privacy, the
 * card shows a dead "Private" pill and "Request to join", and the verified
 * join can never fire from it.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Card, CardCommunityDossier } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

// After the env mock: the action bar's module graph reads it at import time.
const { CommunityActionBar } = await import("@/components/cards/CardActionBar");
const { CommunityDossierBack } = await import("@/components/cards/CommunityDossier");

function dossier(type: CardCommunityDossier["type"]): CardCommunityDossier {
  return {
    type,
    privacy: "closed",
    member_count: 3,
    verification: null,
    chain_tag: null,
    trust_min: null,
    collection_stats: null,
    viewer_is_member: false,
    // F-244: the server's verdict — a delegator group's join verifies the
    // delegation; a genuinely closed plain group needs approval.
    can_join:
      type === "validator"
        ? { allowed: true, unlock_hint: null, reason_code: null }
        : { allowed: false, unlock_hint: null, reason_code: "requires_approval" },
    viewer_membership_status: "none",
  };
}

const card = { id: 31, name: "Delegators: Acme" } as unknown as Card;

function renderBar(type: CardCommunityDossier["type"], onJoin: (c: Card) => void) {
  const d = dossier(type);
  return render(
    <CommunityActionBar card={card} dossier={d} onJoin={onJoin} isJoined={false} joinPending={false} />,
  );
}

afterEach(cleanup);

describe("community card, validator group", () => {
  it("keeps JOIN live on the action bar", () => {
    const onJoin = vi.fn();
    renderBar("validator", onJoin);

    const button = screen.getByRole("button", { name: "Join Delegators: Acme" });
    expect(button).toBeEnabled();
    expect(screen.queryByText("Private")).toBeNull();
    fireEvent.click(button);
    expect(onJoin).toHaveBeenCalledWith(card);
  });

  it("leaves a genuinely closed plain group as Private", () => {
    const onJoin = vi.fn();
    renderBar("user", onJoin);

    fireEvent.click(screen.getByRole("button", { name: "Private — Delegators: Acme" }));
    expect(screen.getByText("Private")).toBeInTheDocument();
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("doesn't describe a request queue on the back of the card", () => {
    render(<CommunityDossierBack dossier={dossier("validator")} />);

    expect(screen.getByText("Delegators only")).toBeInTheDocument();
    expect(screen.queryByText("Request to join")).toBeNull();
  });
});
