/**
 * F-244 — the community card's JOIN cell renders the server's verdict.
 *
 * It used to recompute "can I join?" from privacy / type / trust_min, which
 * was wrong for banned viewers, trust below the threshold, delegator
 * groups, and pending requests and invites. bcc-trust #667 puts the group
 * page's own verdict on the card: `can_join`, `can_request_join`,
 * `viewer_membership_status`. Every case below is one the old logic got
 * wrong or could not express.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import type { Card, CardCommunityDossier } from "@/lib/api/types";

vi.mock("next/navigation", () => ({ usePathname: () => "/communities" }));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("@/hooks/useWatch", () => ({
  useWatchMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useUnwatchMutation: () => ({ mutate: vi.fn(), isPending: false }),
  watchErrorCopy: () => "",
}));
vi.mock("@/hooks/useWatching", () => ({ useWatching: () => ({ data: { items: [] } }) }));
vi.mock("@/hooks/useAttestations", () => ({
  useCastAttestation: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeAttestation: () => ({ mutate: vi.fn(), isPending: false }),
}));

const { CommunityActionBar, JOIN_UNKNOWN_COPY } = await import("@/components/cards/CardActionBar");

const card = { id: 31, name: "Atlas" } as unknown as Card;

type Verdict = { allowed: boolean; unlock_hint: string | null; reason_code: string | null };
function dossier(over: Partial<CardCommunityDossier> & { can_join?: Verdict }): CardCommunityDossier {
  return {
    // An OPEN, ungated plain group: the old logic always offered Join here.
    type: "user",
    privacy: "open",
    member_count: 3,
    verification: null,
    chain_tag: null,
    trust_min: null,
    collection_stats: null,
    viewer_is_member: false,
    viewer_membership_status: "none",
    ...over,
  } as CardCommunityDossier;
}

function renderBar(d: CardCommunityDossier, onJoin = vi.fn()) {
  render(<CommunityActionBar card={card} dossier={d} onJoin={onJoin} isJoined={false} joinPending={false} />);
  return onJoin;
}

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("JOIN cell from the server's verdict", () => {
  it("allowed → Join, which calls onJoin", () => {
    const onJoin = renderBar(dossier({ can_join: { allowed: true, unlock_hint: null, reason_code: null } }));
    fireEvent.click(screen.getByRole("button", { name: "Join Atlas" }));
    expect(onJoin).toHaveBeenCalledWith(card);
  });

  it("a banned viewer of an open group sees Removed, never Join", () => {
    const onJoin = renderBar(
      dossier({
        can_join: { allowed: false, unlock_hint: "A moderator removed you from this community.", reason_code: "removed" },
      }),
    );
    const pill = screen.getByRole("button", { name: "Removed — Atlas" });
    fireEvent.click(pill);
    expect(screen.getByRole("status")).toHaveTextContent("A moderator removed you from this community.");
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("below the trust threshold → locked, with the server's hint (the old bar offered Join)", () => {
    const onJoin = renderBar(
      dossier({
        trust_min: 50,
        can_join: { allowed: false, unlock_hint: "Reach Trusted standing to join.", reason_code: "trust_threshold" },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Atlas/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Reach Trusted standing to join.");
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("verify_on_join (holder group in a list) → Join; the join verifies the wallet", () => {
    const onJoin = renderBar(
      dossier({ type: "nft", can_join: { allowed: true, unlock_hint: null, reason_code: "verify_on_join" } }),
    );
    const pill = screen.getByRole("button", { name: "Join Atlas" });
    expect(pill).toHaveAttribute("title", "Verifies your linked wallet holds this collection, then joins.");
    fireEvent.click(pill);
    expect(onJoin).toHaveBeenCalled();
  });

  it("unavailable (membership unreadable) → never Join; says it couldn't check", () => {
    const onJoin = renderBar(
      dossier({ viewer_membership_status: null, can_join: { allowed: false, unlock_hint: null, reason_code: "unavailable" } }),
    );
    fireEvent.click(screen.getByRole("button", { name: /Atlas/ }));
    expect(screen.getByRole("status")).toHaveTextContent(JOIN_UNKNOWN_COPY);
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("no verdict at all (backend before #667) → the same unknown state, not a guess", () => {
    const onJoin = renderBar(dossier({}));
    fireEvent.click(screen.getByRole("button", { name: /Atlas/ }));
    expect(screen.getByRole("status")).toHaveTextContent(JOIN_UNKNOWN_COPY);
    expect(onJoin).not.toHaveBeenCalled();
  });

  it("a pending request reads Requested", () => {
    renderBar(
      dossier({
        privacy: "closed",
        viewer_membership_status: "requested",
        can_join: { allowed: false, unlock_hint: null, reason_code: "requires_approval" },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Requested — Atlas" }));
    expect(screen.getByRole("status")).toHaveTextContent(/waiting for a moderator/);
  });

  it("an invitation reads Invited", () => {
    renderBar(
      dossier({
        privacy: "secret",
        viewer_membership_status: "invited",
        can_join: { allowed: false, unlock_hint: null, reason_code: "invite_only" },
      }),
    );
    expect(screen.getByRole("button", { name: "Invited — Atlas" })).toBeInTheDocument();
  });

  it("a member by status reads Member even when viewer_is_member lags", () => {
    renderBar(dossier({ viewer_membership_status: "member", can_join: { allowed: false, unlock_hint: null, reason_code: "already_member" } }));
    expect(screen.getByRole("button", { name: "You are a member of Atlas" })).toBeInTheDocument();
  });

  it("signed out → a sign-in link, not a dead pill", () => {
    renderBar(dossier({ can_join: { allowed: false, unlock_hint: "Sign in to join.", reason_code: "auth_required" } }));
    expect(screen.getByRole("link", { name: "Sign in to join Atlas" })).toBeInTheDocument();
  });

  it("a closed group the viewer could ask to join still reads Private (no request flow yet, F-272)", () => {
    renderBar(
      dossier({
        privacy: "closed",
        can_join: { allowed: false, unlock_hint: null, reason_code: "requires_approval" },
        can_request_join: { allowed: true, unlock_hint: null, reason_code: null },
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Private — Atlas" }));
    expect(screen.getByRole("status")).toHaveTextContent("This community is private.");
    expect(screen.queryByText(/request/i)).toBeNull();
  });
});
