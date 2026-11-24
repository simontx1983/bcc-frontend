/**
 * A delegator community is stored `closed`, but nothing queues behind that:
 * the gate is the delegation the join verifies. Read as plain privacy, the
 * card shows a dead "Private" pill and "Request to join", and the verified
 * join can never fire from it.
 *
 * F-244 review (HIGH 1): the server ALWAYS sends a delegator group
 * `can_join: {allowed: false, reason_code: "not_eligible"}` (and a holder
 * group the same on its detail card), because no live on-chain check runs
 * at render time. The fixture used to say `allowed: true`, which the server
 * never sends, so the card's lock on `not_eligible` went unseen. The card
 * now applies the rule the group-page strip and the profile Groups tab
 * already apply: on an nft / validator group, `not_eligible` means "Join,
 * which verifies".
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { filledNotice } from "@/components/cards/pill-notice.testing";

import type { Card, CardCommunityDossier } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

// After the env mock: the action bar's module graph reads it at import time.
const { CommunityActionBar, JOIN_ASK_PAGE_COPY } = await import("@/components/cards/CardActionBar");
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
    // F-244: the server's REAL verdict — a delegator group is always
    // not_eligible (the join verifies the delegation); a genuinely closed
    // plain group needs approval.
    can_join:
      type === "validator"
        ? {
            allowed: false,
            unlock_hint: "Delegate to this validator to join its community.",
            reason_code: "not_eligible",
          }
        : { allowed: false, unlock_hint: null, reason_code: "requires_approval" },
    viewer_membership_status: "none",
  };
}

const card = { id: 31, name: "Delegators: Acme" } as unknown as Card;

function renderBar(
  type: CardCommunityDossier["type"],
  onJoin: (c: Card) => void,
  override: Partial<CardCommunityDossier> = {},
) {
  const d = { ...dossier(type), ...override };
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

  it("a holder group's not_eligible (detail card) is the verifying Join too", () => {
    const onJoin = vi.fn();
    renderBar("nft", onJoin, {
      can_join: { allowed: false, unlock_hint: null, reason_code: "not_eligible" },
    });

    const button = screen.getByRole("button", { name: "Join Delegators: Acme" });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("title", "Verifies your linked wallet holds this collection, then joins.");
    fireEvent.click(button);
    expect(onJoin).toHaveBeenCalledWith(card);
  });

  it("control: not_eligible on a plain group stays locked (a suspension, not a check)", () => {
    const onJoin = vi.fn();
    renderBar("user", onJoin, {
      can_join: { allowed: false, unlock_hint: null, reason_code: "not_eligible" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Join Delegators: Acme" }));
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("a null verdict (a surface that has not adopted it) sends the viewer to the group page", async () => {
    const onJoin = vi.fn();
    renderBar("user", onJoin, { can_join: null, can_request_join: null, viewer_membership_status: null });

    const button = screen.getByRole("button", { name: "Join Delegators: Acme" });
    fireEvent.click(button);
    expect(onJoin).not.toHaveBeenCalled();
    expect((await filledNotice("status"))).toHaveTextContent(JOIN_ASK_PAGE_COPY);
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
