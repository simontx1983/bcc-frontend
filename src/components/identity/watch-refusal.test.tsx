/**
 * F-236 — a refused watch is visible on every watch surface.
 *
 * Since contract v1.124 (F-29), POST /me/watching/watch refuses with 403
 * `bcc_forbidden` when a block exists in either direction, or the viewer
 * is suspended. Before this, none of the watch call sites handled an error,
 * so the button just stayed "Watch" and nothing explained why.
 *
 * Each surface must:
 *   - show the generic line, keyed on the code: "You can't watch this
 *     account." It never names a block;
 *   - never render the server's err.message (the fixture's message is a
 *     decoy that must not appear);
 *   - fire the request exactly once (no retry);
 *   - clear the line on the next click.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as WatchModule from "@/hooks/useWatch";
import { BccApiError } from "@/lib/api/types";
import { FOLLOW_COPY } from "@/lib/copy";

const DECOY = "SERVER-SIDE MESSAGE THAT MUST NEVER RENDER";

function forbidden(): BccApiError {
  return new BccApiError("bcc_forbidden", DECOY, 403, null);
}

type MutateOpts = { onError?: (err: unknown) => void; onSuccess?: () => void };

const watchMutate = vi.hoisted(() => vi.fn());
const unwatchMutate = vi.hoisted(() => vi.fn());
const watchingItems = vi.hoisted(() => ({ items: [] as unknown[] }));

// The real useWatch module is kept for watchErrorCopy; its endpoint module
// would pull in the env-checked API client, and the mutations are mocked
// anyway.
vi.mock("@/lib/api/watching-endpoints", () => ({ watchCard: vi.fn(), unwatchCard: vi.fn() }));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("@/hooks/useWatch", async (importOriginal) => {
  const actual = await importOriginal<typeof WatchModule>();
  return {
    ...actual,
    useWatchMutation: () => ({ mutate: watchMutate, isPending: false }),
    useUnwatchMutation: () => ({ mutate: unwatchMutate, isPending: false }),
  };
});
vi.mock("@/hooks/useWatching", () => ({
  WATCHING_QUERY_KEY_ROOT: ["watching"],
  useWatching: () => ({ data: watchingItems }),
}));
vi.mock("@/hooks/useAttestations", () => ({
  useCastAttestation: () => ({ mutate: vi.fn(), isPending: false }),
  useRevokeAttestation: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "authenticated", data: { user: { id: 1 } } }),
}));
vi.mock("@/lib/analytics/posthog", () => ({ captureAnalyticsEvent: vi.fn() }));

// RightSidebar's other widgets: hidden so only Suggested renders.
vi.mock("@/hooks/useMembers", () => ({
  useMembers: () => ({ data: undefined, isLoading: false, isError: true }),
}));
vi.mock("@/hooks/useTrendingHashtags", () => ({
  useTrendingHashtags: () => ({ data: undefined, isLoading: false, isError: true }),
}));
vi.mock("@/hooks/useSuggestedMembers", () => ({
  useSuggestedMembers: () => ({
    data: {
      items: [
        {
          id: 77,
          handle: "dana",
          display_name: "Dana Reyes",
          avatar_url: "",
          reputation_tier: "neutral",
          reputation_tier_label: "Neutral",
          rank_label: null,
          is_in_good_standing: true,
          suggestion_reason: null,
        },
      ],
    },
    isLoading: false,
    isError: false,
  }),
}));
vi.mock("@/components/layout/AdCarousel", () => ({ AdCarousel: () => null }));
vi.mock("@/components/identity/AvatarHovercard", () => ({ AvatarHovercard: () => null }));

// CardGrid: a stand-in card whose button calls onPull, so the grid's own
// wiring (state, line under the cell) is what's under test.
vi.mock("@/components/cards/CardFactory", () => ({
  CardFactory: ({ card, onPull }: { card: { name: string }; onPull?: (c: unknown) => void }) => (
    <button type="button" onClick={() => onPull?.(card)}>
      {`Watch ${card.name}`}
    </button>
  ),
}));

const { watchErrorCopy } = await import("@/hooks/useWatch");
const { MemberFollowButton } = await import("@/components/identity/MemberFollowButton");
const { RightSidebar } = await import("@/components/layout/RightSidebar");
const { CardGrid } = await import("@/components/cards/CardGrid");
const { ActionBar } = await import("@/components/cards/CardActionBar");

/** Make the next watch fail the way the server refuses a blocked pair. */
function refuseNextWatch() {
  watchMutate.mockImplementationOnce((_req: unknown, opts?: MutateOpts) => {
    opts?.onError?.(forbidden());
  });
}

function expectNoDecoy() {
  expect(document.body.textContent ?? "").not.toContain(DECOY);
  for (const el of document.querySelectorAll("[title]")) {
    expect(el.getAttribute("title")).not.toContain(DECOY);
  }
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

beforeEach(() => {
  watchMutate.mockReset();
  unwatchMutate.mockReset();
  watchingItems.items = [];
});
afterEach(cleanup);

describe("watchErrorCopy", () => {
  it("maps a refused watch to the generic line", () => {
    expect(watchErrorCopy(forbidden(), "watch")).toBe("You can't watch this account.");
    expect(FOLLOW_COPY.refused).toBe("You can't watch this account.");
  });

  it("never says 'block', and never returns the server message", () => {
    for (const verb of ["watch", "unwatch"] as const) {
      const text = watchErrorCopy(forbidden(), verb);
      expect(text).not.toMatch(/block/i);
      expect(text).not.toContain(DECOY);
    }
  });

  it("does not claim 'can't watch' for a failed UNwatch", () => {
    expect(watchErrorCopy(forbidden(), "unwatch")).toBe(FOLLOW_COPY.failed);
  });

  it("falls back to the generic failure for other codes and non-API errors", () => {
    expect(watchErrorCopy(new BccApiError("bcc_internal_error", DECOY, 500, null), "watch")).toBe(
      FOLLOW_COPY.failed,
    );
    expect(watchErrorCopy(new Error(DECOY), "watch")).toBe(FOLLOW_COPY.failed);
  });
});

describe("MemberFollowButton (author card)", () => {
  it("shows the refusal inline, once, and clears it on the next click", () => {
    refuseNextWatch();
    render(<MemberFollowButton userId={77} viewerIsWatching={false} viewerWatch={null} />);

    fireEvent.click(screen.getByRole("button", { name: FOLLOW_COPY.cta }));
    expect(watchMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(FOLLOW_COPY.refused);
    expectNoDecoy();

    fireEvent.click(screen.getByRole("button", { name: FOLLOW_COPY.cta }));
    expect(watchMutate).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows nothing on a successful watch", () => {
    render(<MemberFollowButton userId={77} viewerIsWatching={false} viewerWatch={null} />);
    fireEvent.click(screen.getByRole("button", { name: FOLLOW_COPY.cta }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("Suggested members widget (right sidebar)", () => {
  it("shows the refusal under the refused row, once", () => {
    refuseNextWatch();
    render(<RightSidebar />);

    // F-255 / audit M14: the button's name now says who.
    fireEvent.click(screen.getByRole("button", { name: "Watch Dana Reyes" }));
    expect(watchMutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(FOLLOW_COPY.refused);
    expectNoDecoy();
  });
});

describe("CardGrid", () => {
  const CARDS = [
    { id: 1, name: "Alpha", card_kind: "member", viewer_is_watching: false, viewer_watch: null },
    { id: 2, name: "Beta", card_kind: "member", viewer_is_watching: false, viewer_watch: null },
  ] as never;

  it("shows the refusal under the refused card only, once", () => {
    refuseNextWatch();
    render(<CardGrid cards={CARDS} />);

    fireEvent.click(screen.getByRole("button", { name: "Watch Beta" }));
    expect(watchMutate).toHaveBeenCalledTimes(1);

    const line = screen.getByRole("status");
    expect(line).toHaveTextContent(FOLLOW_COPY.refused);
    expect(line.closest("li")).toHaveTextContent("Watch Beta");
    expect(line.closest("li")).not.toHaveTextContent("Watch Alpha");
    expectNoDecoy();

    fireEvent.click(screen.getByRole("button", { name: "Watch Alpha" }));
    expect(screen.queryByRole("status")).toBeNull();
  });
});

describe("card ActionBar (no host onPull)", () => {
  const CARD = {
    id: 42,
    name: "Dana Reyes",
    card_kind: "member",
    permissions: {
      can_watch: { allowed: true, unlock_hint: null },
      can_vouch: { allowed: true, unlock_hint: null },
    },
    viewer_attestation: null,
    viewer_is_watching: false,
    viewer_watch: null,
    links: { self: "/u/dana" },
  } as never;

  it("puts the refusal in the Watch pill's tooltip, like a failed vouch", () => {
    refuseNextWatch();
    render(<ActionBar card={CARD} isPulled={false} />);

    const pill = screen.getByRole("button", { name: "Watch Dana Reyes" });
    expect(pill).toHaveAttribute("title", FOLLOW_COPY.tooltipIdle);
    fireEvent.click(pill);

    expect(watchMutate).toHaveBeenCalledTimes(1);
    expect(pill).toHaveAttribute("title", FOLLOW_COPY.refused);
    expectNoDecoy();
  });
});
