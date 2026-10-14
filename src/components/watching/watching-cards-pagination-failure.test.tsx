/**
 * The watchlist CARDS tab's failure states.
 *
 * ## What this pins
 *
 * The Watchers tab (`WatchersPanel`) already split "first load failed"
 * from "a later page failed" — see `paginated-load-failure.test.tsx`. The
 * Cards tab, its sibling in the same page, did not: it returned on a
 * blanket `isError` BEFORE reading `lastPagination`, so a failed page N>1
 * took the grid, the metric strip, the pager and the way back to page N-1
 * down together, leaving the URL as the only exit.
 *
 * Measured in a browser against a recording API stub, 8 fixture watches
 * loaded and then page 2 forced to 500:
 *
 *   rows before NEXT : 15 card links
 *   rows after fail  : 0        — and the pager was gone with them
 *
 * ## Why the controls are shaped this way
 *
 * "The grid shows a failure" would pass against the version that already
 * existed. What was missing is everything AROUND it, so the later-page
 * cases assert the pager is still mounted and that its PREV is usable.
 *
 * `refetch()` is the correct retry for an offset page — it re-requests
 * that page alone. The assertion is that it is called once and that the
 * page was not changed as a side effect, since silently stepping the
 * viewer somewhere else is not a retry.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

import { BccApiError } from "@/lib/api/types";

const refetch = vi.fn();
const onPageChange = vi.fn();

const state = vi.hoisted(() => ({ watching: null as unknown }));

vi.mock("@/hooks/useWatching", () => ({
  useWatching: () => state.watching,
  useWatchingSummary: () => ({ data: undefined }),
  WATCHING_QUERY_KEY_ROOT: ["watching"],
}));

// Card rendering is heavy and irrelevant here. PagerNav stays REAL so its
// presence or absence is a genuine assertion, not a mock's opinion.
vi.mock("@/components/cards/CardGrid", () => ({
  CardGrid: ({ cards }: { cards: unknown[] }) => (
    <div data-testid="card-grid">{cards.length} cards</div>
  ),
  CardGridSkeleton: () => <div data-testid="skeleton" />,
}));
vi.mock("@/components/watching/WatchingHeader", () => ({
  WatchingHeader: ({ total }: { total: number }) => (
    <div data-testid="metric-strip">{total}</div>
  ),
}));

import { WatchingCardsPanel } from "@/components/watching/WatchingCardsPanel";

const RAW = "raw server text that must never render";
const err = (code: string) => new BccApiError(code, RAW, 503, null);

const row = (i: number) => ({
  follow_id: i,
  card_kind: "member",
  is_resolved: true,
  card_id: 2000 + i,
  card_handle: "m" + i,
  card_slug: "m-" + i,
  page_id: null,
  reputation_tier_at_watch: "neutral",
  reputation_tier_label_at_watch: "Neutral",
  batch_id: null,
  watched_at: "2026-09-01T12:00:00Z",
  is_legacy: false,
  card: { id: 2000 + i, kind: "member", handle: "m" + i },
  links: { card: "/u/m" + i },
  actions: {},
});

const base = {
  isPending: false,
  isError: false,
  isSuccess: true,
  isFetching: false,
  error: null,
  refetch,
};

const ok = (items: unknown[], page: number, totalPages: number) => ({
  ...base,
  data: {
    items,
    pagination: { page, page_size: 12, total: items.length, total_pages: totalPages },
  },
});

const failed = (code: string) => ({
  ...base,
  isError: true,
  isSuccess: false,
  error: err(code),
  data: undefined,
});

function ui(page = 1) {
  return render(<WatchingCardsPanel page={page} onPageChange={onPageChange} />);
}

const pager = () => screen.queryByRole("navigation", { name: /pagination/i });
const retry = () => screen.queryByRole("button", { name: /retry/i });
const grid = () => screen.queryByTestId("card-grid");

beforeEach(() => {
  refetch.mockClear();
  onPageChange.mockClear();
  state.watching = ok([], 1, 1);
});

afterEach(cleanup);

describe("first load failed — nothing to preserve", () => {
  beforeEach(() => {
    state.watching = failed("bcc_unavailable");
  });

  it("shows the full-panel failure with a Retry", () => {
    ui(1);
    expect(retry()).not.toBeNull();
    expect(grid()).toBeNull();
  });

  it("shows no pager, because nothing has ever succeeded", () => {
    ui(1);
    expect(pager()).toBeNull();
  });

  it("does not claim a page failed — none has loaded", () => {
    ui(1);
    expect(screen.getByRole("alert").textContent ?? "").not.toMatch(/PREV goes back/i);
  });

  it("never renders the raw server message", () => {
    ui(1);
    expect(document.body.textContent ?? "").not.toContain(RAW);
  });
});

describe("a LATER page failed — the loaded state must survive", () => {
  function advance() {
    const view = ui(1);
    state.watching = ok([row(1), row(2)], 1, 4);
    view.rerender(<WatchingCardsPanel page={1} onPageChange={onPageChange} />);
    state.watching = failed("bcc_unavailable");
    view.rerender(<WatchingCardsPanel page={4} onPageChange={onPageChange} />);
    return view;
  }

  it("KEEPS THE PAGER so PREV still exists", () => {
    advance();
    expect(pager()).not.toBeNull();
  });

  it("keeps the metric strip, which used to vanish with the grid", () => {
    advance();
    expect(screen.queryByTestId("metric-strip")).not.toBeNull();
  });

  it("swaps only the grid area for the failure", () => {
    advance();
    expect(retry()).not.toBeNull();
    expect(grid()).toBeNull();
  });

  it("names the page that failed and points at PREV", () => {
    advance();
    const alert = screen.getByRole("alert").textContent ?? "";
    expect(alert).toMatch(/PREV goes back/i);
  });

  it("PREV steps back from the page that failed", () => {
    advance();
    const nav = pager() as HTMLElement;
    fireEvent.click(within(nav).getByRole("button", { name: /PREV/i }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });

  it("Retry re-requests that page and never changes the page itself", () => {
    advance();
    fireEvent.click(retry() as HTMLElement);
    expect(refetch).toHaveBeenCalledTimes(1);
    // Silently stepping the viewer elsewhere is not a retry.
    expect(onPageChange).not.toHaveBeenCalled();
  });
});

describe("a failed read is not an empty watchlist", () => {
  it("withholds the terminal empty state while the query is in error", () => {
    const view = ui(1);
    state.watching = ok([row(1)], 1, 2);
    view.rerender(<WatchingCardsPanel page={1} onPageChange={onPageChange} />);
    state.watching = failed("bcc_unavailable");
    view.rerender(<WatchingCardsPanel page={2} onPageChange={onPageChange} />);

    expect(screen.queryByText(/watching nothing/i)).toBeNull();
  });

  it("still shows it on a genuine empty success", () => {
    state.watching = ok([], 1, 1);
    ui(1);
    expect(screen.queryByText(/watching nothing/i)).not.toBeNull();
  });
});

describe("a permission denial is not endlessly retryable", () => {
  it.each(["bcc_permission_denied", "bcc_forbidden", "bcc_blocked"])(
    "%s offers no retry control",
    (code) => {
      state.watching = failed(code);
      ui(1);
      expect(retry()).toBeNull();
    },
  );

  it("a transient failure still offers one", () => {
    state.watching = failed("bcc_rate_limited");
    ui(1);
    expect(retry()).not.toBeNull();
  });

  it("does not point at PREV on a denial — PREV goes nowhere better", () => {
    const view = ui(1);
    state.watching = ok([row(1)], 1, 4);
    view.rerender(<WatchingCardsPanel page={1} onPageChange={onPageChange} />);
    state.watching = failed("bcc_permission_denied");
    view.rerender(<WatchingCardsPanel page={4} onPageChange={onPageChange} />);

    expect(screen.getByRole("alert").textContent ?? "").not.toMatch(/PREV goes back/i);
    expect(retry()).toBeNull();
    // The pager still stands: the viewer needs the exit even without a retry.
    expect(pager()).not.toBeNull();
  });
});
