/**
 * The ballot's two rationed actions confirm first; the first cast does not.
 *
 * Changing a ballot spends the engine's recast budget and withdrawing
 * starts the 24h cooldown, so neither may fire on the click alone. A
 * FIRST cast spends neither and stays one-click.
 *
 * The view-model has no remaining-recast count (`DisputeVoteViewer` is
 * my_choice / my_effective_weight / can_change / can_withdraw), so the
 * recast copy states the limit without a number — pinned below so a
 * fabricated count cannot creep in.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BccApiError,
  type Dispute,
  type DisputeVoteChoice,
  type DisputeVoteViewerState,
} from "@/lib/api/types";

type Callbacks = { onSuccess?: () => void; onError?: (err: unknown) => void };

const fx = vi.hoisted(() => ({
  viewer: {
    my_choice: null as DisputeVoteChoice | null,
    my_effective_weight: null as number | null,
    can_change: false,
    can_withdraw: false,
  },
  cast: vi.fn(),
  withdraw: vi.fn(),
}));

const DISPUTE: Dispute = {
  id: 12,
  vote_id: 3,
  page_id: 40,
  page_title: "Example Validator",
  voter_name: "voter",
  reporter_name: "reporter",
  reason: "The downvote cites a slashing event that never happened.",
  evidence_url: "",
  status: "reviewing",
  created_at: "2026-11-01T00:00:00Z",
  resolved_at: null,
} as Dispute;

vi.mock("@/hooks/useDisputes", () => ({
  useMyDisputes: () => ({
    isPending: false,
    isLoadingError: false,
    isRefetchError: false,
    error: null,
    data: [DISPUTE],
    refetch: vi.fn(),
  }),
  useDisputeVote: (): { data: DisputeVoteViewerState } => ({
    data: {
      dispute_id: 12,
      status: "open",
      opened_at: "2026-11-01T00:00:00Z",
      binding_earliest_at: "2026-11-03T00:00:00Z",
      expires_at: "2026-11-08T00:00:00Z",
      viewer: { ...fx.viewer },
    },
  }),
  useCastDisputeVote: () => ({ mutate: fx.cast, isPending: false }),
  useWithdrawDisputeVote: () => ({ mutate: fx.withdraw, isPending: false }),
}));

const { DisputeDetail } = await import("@/components/disputes/DisputeDetail");

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

beforeEach(() => {
  fx.cast.mockReset();
  fx.withdraw.mockReset();
  fx.viewer = { my_choice: null, my_effective_weight: null, can_change: false, can_withdraw: false };
});

afterEach(cleanup);

const fail = (code: string) => (_vars: unknown, cb: Callbacks) =>
  cb.onError?.(new BccApiError(code, "raw server prose", 409, null));
const succeed = (_vars: unknown, cb: Callbacks) => cb.onSuccess?.();

describe("first cast", () => {
  it("has no confirm: the click casts", () => {
    render(<DisputeDetail id={12} />);
    fireEvent.click(screen.getByRole("button", { name: "UPHOLD THE DISPUTE" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fx.cast).toHaveBeenCalledTimes(1);
    expect(fx.cast.mock.calls[0]?.[0]).toEqual({ disputeId: 12, request: { choice: "uphold" } });
  });
});

describe("recast", () => {
  beforeEach(() => {
    fx.viewer = { my_choice: "uphold", my_effective_weight: 1.2, can_change: true, can_withdraw: true };
  });

  const open = () => {
    render(<DisputeDetail id={12} />);
    fireEvent.click(screen.getByRole("button", { name: "REJECT THE DISPUTE" }));
    return screen.getByRole("dialog", { name: "Change your vote?" });
  };

  it("opens a confirmation and casts nothing", () => {
    const dialog = open();
    expect(
      within(dialog).getByText(
        "Your ballot changes from UPHOLD to REJECT. You can only change your vote a limited number of times.",
      ),
    ).toBeInTheDocument();
    expect(fx.cast).not.toHaveBeenCalled();
  });

  it("states the limit without inventing a count", () => {
    const text = open().textContent ?? "";
    expect(text).not.toMatch(/\d+ (?:change|time)/i);
  });

  it("confirming casts the new choice and closes", () => {
    fx.cast.mockImplementation(succeed);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "CHANGE VOTE" }));
    expect(fx.cast).toHaveBeenCalledTimes(1);
    expect(fx.cast.mock.calls[0]?.[0]).toEqual({ disputeId: 12, request: { choice: "reject" } });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("KEEP MY VOTE casts nothing", () => {
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "KEEP MY VOTE" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fx.cast).not.toHaveBeenCalled();
  });

  it("an exhausted budget shows inside the dialog, code-keyed", () => {
    fx.cast.mockImplementation(fail("bcc_dispute_vote_recast_exhausted"));
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "CHANGE VOTE" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "You've used all your ballot changes on this dispute.",
    );
    expect(screen.queryByText(/raw server prose/)).toBeNull();
  });
});

describe("withdraw", () => {
  beforeEach(() => {
    fx.viewer = { my_choice: "reject", my_effective_weight: 1, can_change: false, can_withdraw: true };
  });

  const open = () => {
    render(<DisputeDetail id={12} />);
    fireEvent.click(screen.getByRole("button", { name: "WITHDRAW BALLOT" }));
    return screen.getByRole("dialog", { name: "Withdraw your ballot?" });
  };

  it("opens a confirmation with the cooldown and withdraws nothing", () => {
    const dialog = open();
    expect(
      within(dialog).getByText(
        "Withdrawing removes your vote. You'll have to wait 24 hours before you can vote on this dispute again.",
      ),
    ).toBeInTheDocument();
    expect(fx.withdraw).not.toHaveBeenCalled();
  });

  it("WITHDRAW withdraws and closes", () => {
    fx.withdraw.mockImplementation(succeed);
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "WITHDRAW" }));
    expect(fx.withdraw).toHaveBeenCalledTimes(1);
    expect(fx.withdraw.mock.calls[0]?.[0]).toEqual({ disputeId: 12 });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("KEEP MY VOTE withdraws nothing", () => {
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "KEEP MY VOTE" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fx.withdraw).not.toHaveBeenCalled();
  });

  it("a failure shows inside the dialog, code-keyed", () => {
    fx.withdraw.mockImplementation(fail("bcc_dispute_vote_cooldown"));
    const dialog = open();
    fireEvent.click(within(dialog).getByRole("button", { name: "WITHDRAW" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "You withdrew recently — ballots reopen after a 24-hour cooldown.",
    );
  });
});
