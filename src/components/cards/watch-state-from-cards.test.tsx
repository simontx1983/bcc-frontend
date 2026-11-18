/**
 * F-255 (H9) — every watch button reads the server's per-card answer.
 *
 * Before: each button searched the first page of /me/watching (50 items).
 * Past the 50th watch a watched card read "Watch" and could not be
 * unwatched. Now `viewer_is_watching` / `viewer_watch` drive the state and
 * the DELETE handle; the outcome of a toggle comes from the mutation
 * response. /me/watching is never read here (it is not even mocked).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as WatchModule from "@/hooks/useWatch";
import type { Card } from "@/lib/api/types";
import { FOLLOW_COPY } from "@/lib/copy";

type Opts = { onSuccess?: (res: unknown) => void; onError?: (err: unknown) => void };
const watchMutate = vi.hoisted(() => vi.fn());
const unwatchMutate = vi.hoisted(() => vi.fn());
const watchingRead = vi.hoisted(() => vi.fn());

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("@/lib/api/watching-endpoints", () => ({ watchCard: vi.fn(), unwatchCard: vi.fn() }));
vi.mock("@/hooks/useWatch", async (importOriginal) => {
  const actual = await importOriginal<typeof WatchModule>();
  return {
    ...actual,
    useWatchMutation: () => ({ mutate: watchMutate, isPending: false }),
    useUnwatchMutation: () => ({ mutate: unwatchMutate, isPending: false }),
  };
});
// Any read of the watchlist would be the old, capped derivation.
vi.mock("@/hooks/useWatching", () => ({
  WATCHING_QUERY_KEY_ROOT: ["watching"],
  useWatching: (...a: unknown[]) => {
    watchingRead(...a);
    return { data: undefined };
  },
}));
vi.mock("@/hooks/useAttestations", () => ({
  useCastAttestation: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeAttestation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: 1 } } }),
}));
vi.mock("@/lib/analytics/posthog", () => ({ captureAnalyticsEvent: vi.fn() }));
// The grid's card: a stand-in exposing exactly what CardGrid hands it.
vi.mock("@/components/cards/CardFactory", () => ({
  CardFactory: ({
    card,
    isPulled,
    onPull,
  }: {
    card: Card & { permissions?: { can_watch?: { allowed: boolean; unlock_hint: string | null } } };
    isPulled: boolean;
    onPull: (c: Card) => void;
  }) => (
    <button
      type="button"
      aria-pressed={isPulled}
      disabled={card.permissions?.can_watch?.allowed === false}
      title={card.permissions?.can_watch?.unlock_hint ?? undefined}
      onClick={() => onPull(card)}
    >
      {`${isPulled ? "Watching" : "Watch"} ${card.name}`}
    </button>
  ),
}));

const { CardGrid } = await import("@/components/cards/CardGrid");
const { ActionBar } = await import("@/components/cards/CardActionBar");
const { MemberFollowButton } = await import("@/components/identity/MemberFollowButton");
const { WATCH_UNKNOWN_COPY } = await import("@/hooks/useViewerWatch");

const allowed = { can_watch: { allowed: true, unlock_hint: null }, can_vouch: { allowed: true, unlock_hint: null } };

/** A validator page the viewer watched as their 73rd watch. */
const WATCHED_PAST_50 = {
  id: 501,
  name: "Fixture Validator",
  card_kind: "validator",
  permissions: allowed,
  viewer_attestation: null,
  links: { self: "/v/fixture" },
  viewer_is_watching: true,
  viewer_watch: { follow_id: 9073, source: "peepso" },
} as unknown as Card;

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
  watchMutate.mockReset();
  unwatchMutate.mockReset();
  watchingRead.mockReset();
});
afterEach(cleanup);

describe("CardGrid", () => {
  it("a card watched past the first 50 shows Watching and unwatches with its own handle", () => {
    unwatchMutate.mockImplementation((_req: unknown, opts?: Opts) => opts?.onSuccess?.({ status: "unwatched" }));
    render(<CardGrid cards={[WATCHED_PAST_50]} />);

    const btn = screen.getByRole("button", { name: "Watching Fixture Validator" });
    expect(btn).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(btn);

    expect(unwatchMutate).toHaveBeenCalledWith(
      expect.objectContaining({ follow_id: 9073, source: "peepso" }),
      expect.anything(),
    );
    expect(screen.getByRole("button", { name: "Watch Fixture Validator" })).toHaveAttribute("aria-pressed", "false");
    expect(watchingRead).not.toHaveBeenCalled();
  });

  it("a watch takes its handle from the response, so the next click unwatches it", () => {
    watchMutate.mockImplementation((_req: unknown, opts?: Opts) =>
      opts?.onSuccess?.({ status: "watched", item: { follow_id: 77, follow_source: "page" } }),
    );
    unwatchMutate.mockImplementation((_req: unknown, opts?: Opts) => opts?.onSuccess?.({ status: "unwatched" }));
    const notWatched = { ...WATCHED_PAST_50, viewer_is_watching: false, viewer_watch: null } as Card;
    render(<CardGrid cards={[notWatched]} />);

    fireEvent.click(screen.getByRole("button", { name: "Watch Fixture Validator" }));
    expect(watchMutate).toHaveBeenCalledWith({ target_kind: "validator", target_id: 501 }, expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Watching Fixture Validator" }));
    expect(unwatchMutate).toHaveBeenCalledWith(
      expect.objectContaining({ follow_id: 77, source: "page" }),
      expect.anything(),
    );
  });

  it("unknown (null) never offers Watch: disabled with a reason, and a click sends nothing", () => {
    const unknown = { ...WATCHED_PAST_50, viewer_is_watching: null, viewer_watch: null } as Card;
    render(<CardGrid cards={[unknown]} />);
    const btn = screen.getByRole("button", { name: /Fixture Validator/ });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", WATCH_UNKNOWN_COPY);
    fireEvent.click(btn);
    expect(watchMutate).not.toHaveBeenCalled();
    expect(unwatchMutate).not.toHaveBeenCalled();
  });
});

describe("card ActionBar (profile hero, no host)", () => {
  it("reads the card's own answer and unwatches with its handle", () => {
    unwatchMutate.mockImplementation((_req: unknown, opts?: Opts) => opts?.onSuccess?.({ status: "unwatched" }));
    render(<ActionBar card={WATCHED_PAST_50} isPulled={false} />);
    const pill = screen.getByRole("button", { name: "Stop watching Fixture Validator" });
    expect(pill).toHaveAttribute("title", FOLLOW_COPY.tooltipActive);
    fireEvent.click(pill);
    expect(unwatchMutate).toHaveBeenCalledWith(
      expect.objectContaining({ follow_id: 9073, source: "peepso" }),
      expect.anything(),
    );
    expect(screen.getByRole("button", { name: "Watch Fixture Validator" })).toBeInTheDocument();
    expect(watchingRead).not.toHaveBeenCalled();
  });

  it("unknown locks the pill; its tooltip and a tap both give the unknown reason", () => {
    const unknown = { ...WATCHED_PAST_50, viewer_is_watching: null, viewer_watch: null } as Card;
    render(<ActionBar card={unknown} isPulled={false} />);
    const pill = screen.getByRole("button", { name: "Watch Fixture Validator" });
    expect(pill).toHaveAttribute("aria-disabled", "true");
    expect(pill).toHaveAttribute("title", WATCH_UNKNOWN_COPY);

    fireEvent.click(pill);
    expect(screen.getByText(WATCH_UNKNOWN_COPY)).toBeInTheDocument();
    expect(screen.queryByText(/Watch is unavailable for this card/)).toBeNull();
    expect(watchMutate).not.toHaveBeenCalled();
  });
});

describe("MemberFollowButton (author card)", () => {
  it("shows Watching from the profile and unwatches with its handle", () => {
    unwatchMutate.mockImplementation((_req: unknown, opts?: Opts) => opts?.onSuccess?.({ status: "unwatched" }));
    render(
      <MemberFollowButton
        userId={42}
        name="Dana Reyes"
        viewerIsWatching
        viewerWatch={{ follow_id: 9100, source: "peepso" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Stop watching Dana Reyes" }));
    expect(unwatchMutate).toHaveBeenCalledWith(
      expect.objectContaining({ follow_id: 9100, source: "peepso", target: { card_kind: "member", id: 42 } }),
      expect.anything(),
    );
    expect(screen.getByRole("button", { name: "Watch Dana Reyes" })).toBeInTheDocument();
  });

  it("while the profile loads or is private (no fields), the button is disabled with a reason", () => {
    render(<MemberFollowButton userId={42} name="Dana Reyes" />);
    const btn = screen.getByRole("button", { name: "Watch Dana Reyes" });
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("title", WATCH_UNKNOWN_COPY);
  });
});
