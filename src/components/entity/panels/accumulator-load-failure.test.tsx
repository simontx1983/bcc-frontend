/**
 * C2-accumulators — accumulated paper panels keep what they already read.
 *
 * All three hold their pages in a `useState` accumulator, and all three
 * returned their error branch *above* that accumulator — so a failed LOAD
 * MORE threw away a fully-read list even though the items were still in
 * state. Same defect class as C1b/C2-routes, three more times.
 *
 * Two behaviours are load-bearing beyond "show a Retry":
 *
 *   • **Cursor safety.** While the current page/offset is failing, the
 *     ordinary LOAD MORE is withdrawn — advancing would skip the page
 *     that failed. Retry refetches that same page, and paging resumes
 *     once it succeeds.
 *   • **seenPage / seenOffset stays authoritative.** A failed page never
 *     records itself, so a successful retry appends exactly that page:
 *     no duplicate rows, no skipped cursor.
 *
 * `WatchingPanel`'s `bcc_permission_denied` privacy branch is explicitly
 * NOT a failure state and must keep its private EmptyState with no Retry.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const refetch = { reviews: vi.fn(), watchers: vi.fn(), followers: vi.fn(), following: vi.fn() };

// Keyed by the page/offset the component asks for — the real hooks put
// it in the query key, so serving stale page-1 data for page 2 would be
// an unfaithful mock (and would fake a duplicate append).
const state = vi.hoisted(() => ({
  reviews: {} as Record<number, unknown>,
  watchers: {} as Record<number, unknown>,
  followers: {} as Record<number, unknown>,
  following: {} as Record<number, unknown>,
}));

/** Unknown page/offset = request in flight. */
const PENDING = { isPending: true, isError: false, error: null, data: undefined };

vi.mock("@/hooks/useCardTabs", () => ({
  useCardReviews: (_k: unknown, _i: unknown, page = 1) =>
    state.reviews[page] ?? PENDING,
  useCardWatchers: (_k: unknown, _i: unknown, offset = 0) =>
    state.watchers[offset] ?? PENDING,
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
  state.reviews = {};
  state.watchers = {};
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

const reviewsOk = (items: unknown[], page: number, totalPages: number) => ({
  ...base("reviews"),
  data: { items, pagination: { page, per_page: 10, total: 40, total_pages: totalPages } },
});
const offsetOk = (items: unknown[], key: keyof typeof refetch, offset: number, hasMore: boolean) => ({
  ...base(key),
  data: { items, pagination: { offset, limit: 24, total: 50, has_more: hasMore } },
});

// ── CardReviewsPanel ──────────────────────────────────────────────────

describe("CardReviewsPanel — accumulated reviews", () => {
  const ui = () => <CardReviewsPanel kind="validator_card" cardId={1} cardName="Ada" />;

  it("first-load failure renders the paper failure with a Retry", () => {
    state.reviews[1] = failed("bcc_unavailable", "reviews");
    render(ui());

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/reviews are temporarily unavailable/i);
    expect(alert.className).toContain("text-ink-soft");
    expect(alert).not.toHaveTextContent(new RegExp(RAW, "i"));
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("first-load failure shows no empty state and no invented content", () => {
    state.reviews[1] = failed("bcc_unavailable", "reviews");
    render(ui());
    expect(screen.queryByText(/no reviews of ada yet/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("Retry refetches only the reviews query", () => {
    state.reviews[1] = failed("bcc_rate_limited", "reviews");
    render(ui());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(refetch.reviews).toHaveBeenCalledTimes(1);
    for (const [k, spy] of Object.entries(refetch)) {
      if (k !== "reviews") expect(spy).not.toHaveBeenCalled();
    }
  });

  it("a failed LOAD MORE keeps the reviews already read", () => {
    state.reviews[1] = reviewsOk([review(1), review(2)], 1, 3);
    const { rerender } = render(ui());
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    state.reviews[2] = failed("bcc_unavailable", "reviews");
    rerender(ui());

    // accumulated rows survive…
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    // …and the failure is the recovery UI at the foot of the list
    expect(screen.getByRole("alert")).toHaveTextContent(
      /reviews are temporarily unavailable/i,
    );
  });

  it("cursor safety: LOAD MORE is withdrawn while the page is failing", () => {
    state.reviews[1] = reviewsOk([review(1)], 1, 3);
    const { rerender } = render(ui());
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    state.reviews[2] = failed("bcc_unavailable", "reviews");
    rerender(ui());

    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("a successful retry appends the failed page exactly once", () => {
    state.reviews[1] = reviewsOk([review(1), review(2)], 1, 2);
    const { rerender } = render(ui());
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    state.reviews[2] = failed("bcc_unavailable", "reviews");
    rerender(ui());
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    // page 2 now succeeds — seenPage never recorded it, so it appends once
    state.reviews[2] = reviewsOk([review(3), review(4)], 2, 2);
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
    state.watchers[0] = failed("bcc_unavailable", "watchers");
    render(ui());
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/watchers are temporarily unavailable/i);
    expect(alert.className).toContain("text-ink-soft");
    expect(alert).not.toHaveTextContent(new RegExp(RAW, "i"));
  });

  it("first-load failure shows no empty state", () => {
    state.watchers[0] = failed("bcc_unavailable", "watchers");
    render(ui());
    expect(screen.queryByText(/no one is watching/i)).not.toBeInTheDocument();
  });

  it("Retry refetches only the watchers query", () => {
    state.watchers[0] = failed("bcc_rate_limited", "watchers");
    render(ui());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(refetch.watchers).toHaveBeenCalledTimes(1);
    for (const [k, spy] of Object.entries(refetch)) {
      if (k !== "watchers") expect(spy).not.toHaveBeenCalled();
    }
  });

  it("a failed LOAD MORE keeps the roster AND the view toggle usable", () => {
    state.watchers[0] = offsetOk([card(1), card(2)], "watchers", 0, true);
    const { rerender } = render(ui());
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    state.watchers[2] = failed("bcc_unavailable", "watchers");
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
    state.watchers[0] = offsetOk([card(1)], "watchers", 0, true);
    const { rerender } = render(ui());
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    state.watchers[1] = failed("bcc_unavailable", "watchers");
    rerender(ui());

    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});

// ── WatchingPanel: two independent rosters + the privacy branch ───────

describe("WatchingPanel — followers / following independence", () => {
  const ui = () => (
    <WatchingPanel handle="ada" displayName="Ada" />
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
    render(ui());

    // switch to the "following" roster. These sub-tabs carry role="tab",
    // which overrides the implicit button role.
    fireEvent.click(screen.getByRole("tab", { name: /keeping tabs/i }));

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
  const ui = () => <WatchingPanel handle="ada" displayName="Ada" />;

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
    state.watchers[0] = offsetOk([card(1), card(2)], "watchers", 0, true);
    const { rerender } = render(ui());

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    state.watchers[2] = failed("bcc_unavailable", "watchers");
    rerender(ui());
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // recover at the same offset
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch.watchers).toHaveBeenCalledTimes(1);
    state.watchers[2] = offsetOk([card(3), card(4)], "watchers", 2, false);
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
    state.reviews[1] = reviewsOk([review(1), review(2)], 1, 3);
    const { rerender } = render(
      <CardReviewsPanel kind="validator_card" cardId={1} cardName="Ada" />,
    );

    // page 2 is unmocked => PENDING
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    rerender(<CardReviewsPanel kind="validator_card" cardId={1} cardName="Ada" />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText(/loading reviews/i)).not.toBeInTheDocument();
  });

  it("CardWatchersPanel keeps its roster while the next offset is in flight", () => {
    state.watchers[0] = offsetOk([card(1), card(2)], "watchers", 0, true);
    const { rerender } = render(
      <CardWatchersPanel kind="validator_card" cardId={1} cardName="Ada" isClaimed />,
    );

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
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
    const { rerender } = render(<WatchingPanel handle="ada" displayName="Ada" />);

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    rerender(<WatchingPanel handle="ada" displayName="Ada" />);

    expect(rowsNamed("Card 1")).toHaveLength(1);
    expect(rowsNamed("Card 2")).toHaveLength(1);
  });
});
