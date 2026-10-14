/**
 * Paginated paper panels keep what they already read.
 *
 * All three returned their error branch *above* the rows they already held —
 * so a failed LOAD MORE threw away a fully-read list even though the items
 * were still there. Same defect class as C1b/C2-routes, three more times.
 *
 * The two entity panels now page with `useInfiniteQuery` (WatchingPanel still
 * accumulates in local state, and is unchanged here). The behaviours below
 * are the contract either implementation has to meet, which is why this file
 * survived the rewrite with its assertions intact:
 *
 *   • **Cursor safety.** While the current page/offset is failing, the
 *     ordinary LOAD MORE is withdrawn — advancing would skip the page
 *     that failed. Retry re-requests that same page, and paging resumes
 *     once it succeeds.
 *   • **A failed page never advances the cursor.** A successful retry
 *     appends exactly that page: no duplicate rows, no skipped cursor.
 *
 * `WatchingPanel`'s `bcc_permission_denied` privacy branch is explicitly
 * NOT a failure state and must keep its private EmptyState with no Retry.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const refetch = { reviews: vi.fn(), watchers: vi.fn(), followers: vi.fn(), following: vi.fn() };
/** `fetchNextPage` is how an infinite query re-requests the page that failed. */
const fetchNext = { reviews: vi.fn(), watchers: vi.fn() };

// Keyed by the page/offset the component asks for — the real hooks put
// it in the query key, so serving stale page-1 data for page 2 would be
// an unfaithful mock (and would fake a duplicate append).
const state = vi.hoisted(() => ({
  followers: {} as Record<number, unknown>,
  following: {} as Record<number, unknown>,
}));

/**
 * The two card hooks are infinite queries now, so the mock serves ONE result
 * object holding the page list — the real hook does the same. Each test moves
 * it from state to state the way TanStack would.
 */
const cardState = vi.hoisted(() => ({
  reviews: undefined as unknown,
  watchers: undefined as unknown,
}));

/** Unknown offset = request in flight (WatchingPanel hooks only). */
const PENDING = { isPending: true, isError: false, error: null, data: undefined };

vi.mock("@/hooks/useCardTabs", () => ({
  useCardReviews: () => cardState.reviews ?? PENDING,
  useCardWatchers: () => cardState.watchers ?? PENDING,
}));
vi.mock("@/hooks/useUserActivity", () => ({
  useUserFollowers: (_h: unknown, offset = 0) => state.followers[offset] ?? PENDING,
  useUserFollowing: (_h: unknown, offset = 0) => state.following[offset] ?? PENDING,
}));
vi.mock("@/components/cards/CardGrid", () => ({
  CardGrid: ({ cards }: { cards: unknown[] }) => (
    <div data-testid="card-grid">{cards.length}</div>
  ),
}));
// Avatar reaches the API client transitively; two of these panels import
// it, and one leaking module poisons the whole file's import graph.
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));

import { CardReviewsPanel } from "@/components/entity/panels/CardReviewsPanel";
import { CardWatchersPanel } from "@/components/entity/panels/CardWatchersPanel";
import { WatchingPanel } from "@/components/profile/panels/WatchingPanel";

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
  // Both panels persist the roster view under the SAME localStorage key
  // ("bcc:roster-view"), and jsdom keeps storage between tests — so a
  // test that clicks the grid toggle would silently put every later test
  // into grid view, where there are no list rows to assert on.
  window.localStorage.clear();
  for (const spy of Object.values(refetch)) spy.mockClear();
  for (const spy of Object.values(fetchNext)) spy.mockClear();
  cardState.reviews = undefined;
  cardState.watchers = undefined;
  state.followers = {};
  state.following = {};
});

afterEach(cleanup);


/** Rows (by list-item role) whose text mentions `name`. Precise enough to
 *  prove "appended exactly once" without counting aria-labels. */
function rowsNamed(name: string): string[] {
  return screen
    .queryAllByRole("listitem")
    .map((li) => li.textContent ?? "")
    .filter((t) => t.includes(name));
}

const RAW = "raw server text that must never render";
const apiErr = (code: string) => new BccApiError(code, RAW, 503, null);

const base = (key: keyof typeof refetch) => ({
  isPending: false as const,
  isError: false as const,
  error: null,
  refetch: refetch[key],
});
const failed = (code: string, key: keyof typeof refetch) => ({
  ...base(key),
  isError: true as const,
  error: apiErr(code),
  data: undefined,
});

const review = (id: number) => ({
  id,
  grade: "A",
  subject: `Subject ${id}`,
  scope_label: "MEMBER",
  text: "solid",
  subject_handle: "ada",
  posted_at_label: "1d",
  author: { handle: "ada", display_name: "Ada" },
});
const card = (id: number) => ({
  id,
  kind: "user",
  name: `Card ${id}`,
  handle: `card${id}`,
  rank_label: "OPERATOR",
  reputation_tier: "solid",
  crest: { image_url: null },
});

// ── infinite-query shapes for the two entity panels ───────────────────
const rPage = (items: unknown[], page: number, totalPages: number) => ({
  items,
  pagination: { page, per_page: 10, total: 40, total_pages: totalPages },
});
const wPage = (items: unknown[], offset: number, hasMore: boolean) => ({
  items,
  pagination: { offset, limit: 24, total: 50, has_more: hasMore },
});
const infOk = (pages: unknown[], key: "reviews" | "watchers", hasNextPage: boolean) => ({
  isPending: false as const,
  isError: false as const,
  error: null,
  data: { pages },
  hasNextPage,
  isFetchingNextPage: false,
  fetchNextPage: fetchNext[key],
  refetch: refetch[key],
});
/** Pages already read survive; the page that failed is simply not appended. */
const infFailed = (
  code: string,
  pages: unknown[],
  key: "reviews" | "watchers",
  hasNextPage: boolean,
) => ({
  ...infOk(pages, key, hasNextPage),
  isError: true as const,
  error: apiErr(code),
  ...(pages.length === 0 ? { data: undefined } : {}),
});
const offsetOk = (items: unknown[], key: keyof typeof refetch, offset: number, hasMore: boolean) => ({
  ...base(key),
  data: { items, pagination: { offset, limit: 24, total: 50, has_more: hasMore } },
});

// ── CardReviewsPanel ──────────────────────────────────────────────────

describe("CardReviewsPanel — accumulated reviews", () => {
  const ui = () => <CardReviewsPanel kind="validator_card" cardId={1} cardName="Ada" />;

  it("first-load failure renders the paper failure with a Retry", () => {
    cardState.reviews = infFailed("bcc_unavailable", [], "reviews", false);
    render(ui());

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/reviews are temporarily unavailable/i);
    expect(alert.className).toContain("text-ink-soft");
    expect(alert).not.toHaveTextContent(new RegExp(RAW, "i"));
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("first-load failure shows no empty state and no invented content", () => {
    cardState.reviews = infFailed("bcc_unavailable", [], "reviews", false);
    render(ui());
    expect(screen.queryByText(/no reviews of ada yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("Retry refetches only the reviews query", () => {
    cardState.reviews = infFailed("bcc_rate_limited", [], "reviews", false);
    render(ui());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(refetch.reviews).toHaveBeenCalledTimes(1);
    for (const [k, spy] of Object.entries(refetch)) {
      if (k !== "reviews") expect(spy).not.toHaveBeenCalled();
    }
  });

  it("a failed LOAD MORE keeps the reviews already read", () => {
    cardState.reviews = infOk([rPage([review(1), review(2)], 1, 3)], "reviews", true);
    const { rerender } = render(ui());
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(fetchNext.reviews).toHaveBeenCalledTimes(1);
    // page 2 failed: the page list is untouched, so page 1 is still here
    cardState.reviews = infFailed(
      "bcc_unavailable",
      [rPage([review(1), review(2)], 1, 3)],
      "reviews",
      true,
    );
    rerender(ui());

    // rows already read survive…
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    // …and the failure is the recovery UI at the foot of the list
    expect(screen.getByRole("alert")).toHaveTextContent(
      /reviews are temporarily unavailable/i,
    );
  });

  it("cursor safety: LOAD MORE is withdrawn while the page is failing", () => {
    cardState.reviews = infOk([rPage([review(1)], 1, 3)], "reviews", true);
    const { rerender } = render(ui());
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    cardState.reviews = infFailed(
      "bcc_unavailable",
      [rPage([review(1)], 1, 3)],
      "reviews",
      true,
    );
    rerender(ui());

    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("a successful retry appends the failed page exactly once", () => {
    cardState.reviews = infOk([rPage([review(1), review(2)], 1, 2)], "reviews", true);
    const { rerender } = render(ui());
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    cardState.reviews = infFailed(
      "bcc_unavailable",
      [rPage([review(1), review(2)], 1, 2)],
      "reviews",
      true,
    );
    rerender(ui());
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    // Retry re-requests the page that FAILED, not the ones that succeeded.
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(fetchNext.reviews).toHaveBeenCalled();
    expect(refetch.reviews).not.toHaveBeenCalled();

    // page 2 now succeeds — it was never appended before, so it lands once
    cardState.reviews = infOk(
      [rPage([review(1), review(2)], 1, 2), rPage([review(3), review(4)], 2, 2)],
      "reviews",
      false,
    );
    rerender(ui());

    const ids = screen.getAllByRole("listitem");
    expect(ids).toHaveLength(4);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

// ── CardWatchersPanel ─────────────────────────────────────────────────

describe("CardWatchersPanel — accumulated watchers", () => {
  const ui = () => (
    <CardWatchersPanel kind="validator_card" cardId={1} cardName="Ada" isClaimed />
  );

  it("first-load failure renders the paper failure with a Retry", () => {
    cardState.watchers = infFailed("bcc_unavailable", [], "watchers", false);
    render(ui());
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/watchers are temporarily unavailable/i);
    expect(alert.className).toContain("text-ink-soft");
    expect(alert).not.toHaveTextContent(new RegExp(RAW, "i"));
  });

  it("first-load failure shows no empty state", () => {
    cardState.watchers = infFailed("bcc_unavailable", [], "watchers", false);
    render(ui());
    expect(screen.queryByText(/no one is watching/i)).not.toBeInTheDocument();
  });

  it("Retry refetches only the watchers query", () => {
    cardState.watchers = infFailed("bcc_rate_limited", [], "watchers", false);
    render(ui());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(refetch.watchers).toHaveBeenCalledTimes(1);
    for (const [k, spy] of Object.entries(refetch)) {
      if (k !== "watchers") expect(spy).not.toHaveBeenCalled();
    }
  });

  it("a failed LOAD MORE keeps the roster AND the view toggle usable", () => {
    cardState.watchers = infOk([wPage([card(1), card(2)], 0, true)], "watchers", true);
    const { rerender } = render(ui());
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    cardState.watchers = infFailed(
      "bcc_unavailable",
      [wPage([card(1), card(2)], 0, true)],
      "watchers",
      true,
    );
    rerender(ui());

    // roster survives
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    // the grid/list view toggle is still operable
    const toggle = screen.getByRole("button", { name: /grid/i });
    expect(toggle).toBeEnabled();
    fireEvent.click(toggle);
    expect(screen.getByTestId("card-grid")).toBeInTheDocument();
    // and the failure is still shown alongside it
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("cursor safety: LOAD MORE is withdrawn while the offset is failing", () => {
    cardState.watchers = infOk([wPage([card(1)], 0, true)], "watchers", true);
    const { rerender } = render(ui());
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    cardState.watchers = infFailed(
      "bcc_unavailable",
      [wPage([card(1)], 0, true)],
      "watchers",
      true,
    );
    rerender(ui());

    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

// ── WatchingPanel: two independent rosters + the privacy branch ───────

describe("WatchingPanel — followers / following independence", () => {
  // The two directions used to be sub-tabs of one panel, reached by clicking.
  // The profile regrouping made each a leaf with its own URL, so the panel is
  // now handed the direction. The property under test is unchanged: each
  // roster retries its OWN query and never the sibling's.
  const ui = (direction: "followers" | "following" = "followers") => (
    <WatchingPanel handle="ada" displayName="Ada" direction={direction} />
  );

  it("a followers failure does not refetch following", () => {
    state.followers[0] = failed("bcc_rate_limited", "followers");
    state.following[0] = offsetOk([card(9)], "following", 0, false);
    render(ui());

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch.followers).toHaveBeenCalledTimes(1);
    expect(refetch.following).not.toHaveBeenCalled();
  });

  it("a following failure does not refetch followers", () => {
    state.followers[0] = offsetOk([card(1)], "followers", 0, false);
    state.following[0] = failed("bcc_rate_limited", "following");
    render(ui("following"));

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch.following).toHaveBeenCalledTimes(1);
    expect(refetch.followers).not.toHaveBeenCalled();
  });

  it("bcc_permission_denied keeps the private empty state and offers NO Retry", () => {
    state.followers[0] = failed("bcc_permission_denied", "followers");
    state.following[0] = failed("bcc_permission_denied", "following");
    render(ui());

    expect(screen.getAllByText(/private/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a generic failure never leaks the raw backend message", () => {
    state.followers[0] = failed("bcc_unavailable", "followers");
    state.following[0] = offsetOk([], "following", 0, false);
    render(ui());
    expect(document.body.textContent ?? "").not.toMatch(new RegExp(RAW, "i"));
  });
});

// ── full cursor → failure → recovery transitions ──────────────────────

describe("WatchingPanel — followers cursor failure and recovery", () => {
  // FollowersList and FollowingList render the SAME `RosterList` (one
  // definition, two usages) and differ only in which hook they call and
  // their copy props. One full transition therefore exercises the shared
  // implementation; the bidirectional isolation tests above cover the
  // part that genuinely differs — that each instance retries its own
  // query and never the sibling's.
  const ui = () => (
    <WatchingPanel handle="ada" displayName="Ada" direction="followers" />
  );

  it("keeps members, withdraws LOAD MORE, retries the failed offset, then appends once", () => {
    state.followers[0] = offsetOk([card(1), card(2)], "followers", 0, true);
    state.following[0] = offsetOk([], "following", 0, false);
    const { rerender } = render(ui());

    expect(rowsNamed("Card 1")).toHaveLength(1);
    expect(rowsNamed("Card 2")).toHaveLength(1);

    // advance to the next offset (0 + 2 = 2) and make exactly it fail
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    state.followers[2] = failed("bcc_unavailable", "followers");
    rerender(ui());

    // 1. accumulated members remain visible
    expect(rowsNamed("Card 1")).toHaveLength(1);
    expect(rowsNamed("Card 2")).toHaveLength(1);

    // 2. ordinary LOAD MORE is withdrawn at the failed cursor
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();

    // 3. paper failure with sanitized copy
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/this list is temporarily unavailable/i);
    expect(alert.className).toContain("text-ink-soft");
    expect(alert).not.toHaveTextContent(new RegExp(RAW, "i"));

    // 4. Retry hits only the followers query
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch.followers).toHaveBeenCalledTimes(1);
    expect(refetch.following).not.toHaveBeenCalled();
    expect(refetch.reviews).not.toHaveBeenCalled();
    expect(refetch.watchers).not.toHaveBeenCalled();

    // 5. the retry succeeds at that same offset
    state.followers[2] = offsetOk([card(3), card(4)], "followers", 2, false);
    rerender(ui());

    // appended exactly once — nothing duplicated, nothing skipped
    for (const n of [1, 2, 3, 4]) {
      expect(rowsNamed(`Card ${n}`)).toHaveLength(1);
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("first-load failure does not render the success-only empty state", () => {
    state.followers[0] = failed("bcc_unavailable", "followers");
    state.following[0] = offsetOk([], "following", 0, false);
    render(ui());

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/nobody is watching yet/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/no watchers/i)).not.toBeInTheDocument();
  });
});

describe("CardWatchersPanel — recovery after a failed offset", () => {
  const ui = () => (
    <CardWatchersPanel kind="validator_card" cardId={1} cardName="Ada" isClaimed />
  );

  it("appends the failed offset once and leaves the view toggle working after recovery", () => {
    cardState.watchers = infOk([wPage([card(1), card(2)], 0, true)], "watchers", true);
    const { rerender } = render(ui());

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    cardState.watchers = infFailed(
      "bcc_unavailable",
      [wPage([card(1), card(2)], 0, true)],
      "watchers",
      true,
    );
    rerender(ui());
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // Recover at the SAME offset. With rows already read, Retry re-requests
    // the failed page via fetchNextPage; refetch would re-run the pages that
    // succeeded and skip the one that did not.
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(fetchNext.watchers).toHaveBeenCalled();
    expect(refetch.watchers).not.toHaveBeenCalled();
    cardState.watchers = infOk(
      [wPage([card(1), card(2)], 0, true), wPage([card(3), card(4)], 2, false)],
      "watchers",
      false,
    );
    rerender(ui());

    // no duplicate, no skipped watcher
    for (const n of [1, 2, 3, 4]) {
      expect(rowsNamed(`Card ${n}`)).toHaveLength(1);
    }
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // the view toggle still works AFTER recovery, not just during failure
    fireEvent.click(screen.getByRole("button", { name: /grid/i }));
    expect(screen.getByTestId("card-grid")).toHaveTextContent("4");
  });
});

// ── pending retention, per distinct rendering implementation ──────────

describe("a pending later page never blanks accumulated content", () => {
  it("CardReviewsPanel keeps its reviews while the next page is in flight", () => {
    cardState.reviews = infOk([rPage([review(1), review(2)], 1, 3)], "reviews", true);
    const { rerender } = render(
      <CardReviewsPanel kind="validator_card" cardId={1} cardName="Ada" />,
    );

    // page 2 in flight: isFetchingNextPage true, page list unchanged
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    cardState.reviews = {
      ...infOk([rPage([review(1), review(2)], 1, 3)], "reviews", true),
      isFetchingNextPage: true,
    };
    rerender(<CardReviewsPanel kind="validator_card" cardId={1} cardName="Ada" />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText(/loading reviews/i)).not.toBeInTheDocument();
  });

  it("CardWatchersPanel keeps its roster while the next offset is in flight", () => {
    cardState.watchers = infOk([wPage([card(1), card(2)], 0, true)], "watchers", true);
    const { rerender } = render(
      <CardWatchersPanel kind="validator_card" cardId={1} cardName="Ada" isClaimed />,
    );

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    cardState.watchers = {
      ...infOk([wPage([card(1), card(2)], 0, true)], "watchers", true),
      isFetchingNextPage: true,
    };
    rerender(
      <CardWatchersPanel kind="validator_card" cardId={1} cardName="Ada" isClaimed />,
    );

    expect(rowsNamed("Card 1")).toHaveLength(1);
    expect(rowsNamed("Card 2")).toHaveLength(1);
    expect(screen.queryByText(/loading watchers/i)).not.toBeInTheDocument();
  });

  it("WatchingPanel's roster keeps its members while the next offset is in flight", () => {
    state.followers[0] = offsetOk([card(1), card(2)], "followers", 0, true);
    state.following[0] = offsetOk([], "following", 0, false);
    const { rerender } = render(<WatchingPanel handle="ada" displayName="Ada" direction="followers" />);

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    rerender(<WatchingPanel handle="ada" displayName="Ada" direction="followers" />);

    expect(rowsNamed("Card 1")).toHaveLength(1);
    expect(rowsNamed("Card 2")).toHaveLength(1);
  });
});
