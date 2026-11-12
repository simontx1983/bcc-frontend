/**
 * F-26 (bcc-trust #547): an entity page's watcher list answers
 * `403 bcc_forbidden` with `reason: "profile_private"` when the page
 * OWNER's profile is not viewable by this viewer.
 *
 * That is the owner's choice, not a failure, so the Watchers tab shows the
 * calm "watchers hidden" state (role=status, no alert, no Retry) in every
 * position the refusal can arrive in: first load, a refresh of a roster
 * already on screen (which also withdraws it), and a later page. A plain
 * `bcc_forbidden` without that reason keeps its existing failure line.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as ReactQueryModule from "@tanstack/react-query";
import { BccApiError } from "@/lib/api/types";

const removeQueries = vi.hoisted(() => vi.fn());
const state = vi.hoisted(() => ({ watchers: null as unknown }));
const api = vi.hoisted(() => ({ getCardWatchers: vi.fn() }));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const real = await importOriginal<typeof ReactQueryModule>();
  return {
    ...real,
    // Only the panel test swaps the client; the hook test below builds a
    // real QueryClient and passes it through the provider.
    useQueryClient: (...args: Parameters<typeof real.useQueryClient>) =>
      state.watchers === "REAL" ? real.useQueryClient(...args) : { removeQueries },
  };
});
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/cards/CardGrid", () => ({ CardGrid: () => null }));
vi.mock("@/lib/api/card-tabs-endpoints", () => ({
  getCardReviews: vi.fn(),
  getCardWatchers: (...a: unknown[]) => api.getCardWatchers(...a),
}));

const fetchNextPage = vi.fn();
const refetch = vi.fn();

function privateErr(): BccApiError {
  return new BccApiError("bcc_forbidden", "This profile is private.", 403, {
    error: { code: "bcc_forbidden", message: "This profile is private.", data: { reason: "profile_private" } },
  } as never);
}
function plainForbidden(): BccApiError {
  return new BccApiError("bcc_forbidden", "Forbidden.", 403, {
    error: { code: "bcc_forbidden", message: "Forbidden." },
  } as never);
}

const rosterPage = (ids: number[]) => ({
  items: ids.map((id) => ({ id, handle: "m" + id, name: "Member " + id, rank_label: "", crest: { image_url: null }, reputation_tier: null })),
  pagination: { total: 40, offset: 0, limit: 24, has_more: true },
});

type Branch = "first" | "refetch" | "next";
function failing(pages: unknown[], branch: Branch, error: BccApiError) {
  return {
    isPending: false,
    isError: true,
    isRefetchError: branch === "refetch",
    error,
    data: branch === "first" ? undefined : { pages },
    hasNextPage: true,
    isFetchingNextPage: false,
    fetchNextPage,
    refetch,
  };
}

// The panel imports the hook module, which these panel tests stub; the hook
// test at the bottom needs the real one, so it is imported via importActual.
vi.mock("@/hooks/useCardTabs", async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    useCardWatchers: (...a: unknown[]) =>
      state.watchers === "REAL"
        ? (real["useCardWatchers"] as (...x: unknown[]) => unknown)(...a)
        : state.watchers,
  };
});

const { CardWatchersPanel } = await import("@/components/entity/panels/CardWatchersPanel");
const { useCardWatchers } = await import("@/hooks/useCardTabs");

const renderPanel = () =>
  render(<CardWatchersPanel kind="validator_card" cardId={7} cardName="Node" isClaimed />);
const retryBtn = () => screen.queryByRole("button", { name: /retry/i });
const loadMoreBtn = () => screen.queryByRole("button", { name: /load more/i });

beforeEach(() => {
  vi.clearAllMocks();
  state.watchers = null;
});
afterEach(cleanup);

describe("CardWatchersPanel: owner's profile not viewable (F-26)", () => {
  it("first load: the calm hidden state, no alert and no Retry", () => {
    state.watchers = failing([], "first", privateErr());
    renderPanel();
    const notice = screen.getByTestId("profile-private");
    expect(notice).toHaveAttribute("role", "status");
    expect(notice).toHaveTextContent("Watchers are hidden.");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(retryBtn()).toBeNull();
    // The profile page's own wording does not leak onto an entity page.
    expect(screen.queryByText("This profile is private.")).toBeNull();
  });

  it("a refresh of a roster on screen withdraws it and shows the hidden state", () => {
    state.watchers = failing([rosterPage([1, 2])], "refetch", privateErr());
    renderPanel();
    expect(screen.getByTestId("profile-private")).toHaveTextContent("Watchers are hidden.");
    expect(screen.queryByText("Member 1")).toBeNull();
    expect(removeQueries).toHaveBeenCalledTimes(1);
    expect(retryBtn()).toBeNull();
  });

  it("a later page: the hidden state at the foot, no Retry and no LOAD MORE", () => {
    state.watchers = failing([rosterPage([1, 2])], "next", privateErr());
    renderPanel();
    expect(screen.getByTestId("profile-private")).toHaveTextContent("Watchers are hidden.");
    expect(retryBtn()).toBeNull();
    expect(loadMoreBtn()).toBeNull();
  });

  it("control: a bcc_forbidden WITHOUT the reason keeps its failure line", () => {
    state.watchers = failing([], "first", plainForbidden());
    renderPanel();
    expect(screen.queryByTestId("profile-private")).toBeNull();
    expect(screen.getByText("You can’t see who is watching this card.")).toBeInTheDocument();
    expect(retryBtn()).toBeNull();
  });
});

describe("useCardWatchers: a private answer is final after one request", () => {
  function wrapper(client: QueryClient) {
    return ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }
  const client = () => new QueryClient({ defaultOptions: { queries: { retryDelay: 0 } } });

  it("profile_private: one request, no retry", async () => {
    state.watchers = "REAL";
    api.getCardWatchers.mockRejectedValue(privateErr());
    const { result } = renderHook(() => useCardWatchers("validator_card", 7), { wrapper: wrapper(client()) });
    await vi.waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.getCardWatchers).toHaveBeenCalledTimes(1);
  });

  it("control: a transient failure still gets its one retry", async () => {
    state.watchers = "REAL";
    api.getCardWatchers.mockRejectedValue(new BccApiError("bcc_unavailable", "x", 503, null));
    const { result } = renderHook(() => useCardWatchers("validator_card", 7), { wrapper: wrapper(client()) });
    await vi.waitFor(() => expect(result.current.isError).toBe(true));
    expect(api.getCardWatchers).toHaveBeenCalledTimes(2);
  });
});
