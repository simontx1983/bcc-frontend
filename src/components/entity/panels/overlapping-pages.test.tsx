/**
 * Overlapping pages — consecutive pages that share a record.
 *
 * Offset and page-number pagination address a MOVING list. A review filed, or
 * a watcher gained, between the request for page 1 and the request for page 2
 * shifts the window, so the two pages legitimately overlap. The server is not
 * misbehaving; this is inherent to the scheme.
 *
 * ## What the previous accumulators actually did
 *
 * They did NOT de-duplicate records. `seenPage` / `seenOffset` guarded against
 * applying the same PAGE twice, and the rows were then concatenated
 * (`[...previous, ...page.items]`). Measured against that implementation with
 * the fixtures below: 4 rows rendered for 3 distinct records, the shared record
 * appeared twice, and React warned
 *
 *     Encountered two children with the same key, `2`.
 *
 * on BOTH panels — because both key their rows on the record id. So this file
 * does not protect a guarantee that used to exist; it adds the one that was
 * missing, and `useInfiniteQuery` does not provide it either (it owns the page
 * list, not the records inside it).
 *
 * ## The three properties
 *
 *   1. Each record renders exactly once.
 *   2. Server order survives — first occurrence wins, so a repeated row does
 *      not jump down the list.
 *   3. The cursor still advances by the SERVER rules. De-duplication is a
 *      render concern: walking the cursor by the surviving row count would
 *      skip a record every time an overlap happened.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cardState = vi.hoisted(() => ({
  reviews: undefined as unknown,
  watchers: undefined as unknown,
}));
const fetchNext = { reviews: vi.fn(), watchers: vi.fn() };
const refetch = { reviews: vi.fn(), watchers: vi.fn() };

vi.mock("@/hooks/useCardTabs", () => ({
  useCardReviews: () => cardState.reviews,
  useCardWatchers: () => cardState.watchers,
}));
vi.mock("@/components/cards/CardGrid", () => ({
  CardGrid: ({ cards }: { cards: unknown[] }) => (
    <div data-testid="card-grid">{cards.length}</div>
  ),
}));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));

import { CardReviewsPanel } from "@/components/entity/panels/CardReviewsPanel";
import { CardWatchersPanel } from "@/components/entity/panels/CardWatchersPanel";

/** React logs duplicate-key violations through console.error. */
let keyWarnings: string[] = [];

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
  window.localStorage.clear();
  keyWarnings = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const text = args.map(String).join(" ");
    if (/same key/i.test(text)) keyWarnings.push(text);
  });
  cardState.reviews = undefined;
  cardState.watchers = undefined;
  fetchNext.reviews.mockClear();
  fetchNext.watchers.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

const review = (id: number) => ({
  id,
  grade: "A" as const,
  text: `review ${id}`,
  posted_at_label: "1d",
  author: { handle: `a${id}`, display_name: `A ${id}`, avatar_url: "" },
});
const card = (id: number) => ({
  id,
  kind: "user",
  name: `Card ${id}`,
  handle: `c${id}`,
  rank_label: "",
  reputation_tier: "neutral",
  crest: { image_url: null },
});

const inf = (pages: unknown[], key: "reviews" | "watchers", hasNextPage: boolean) => ({
  isPending: false as const,
  isError: false as const,
  error: null,
  data: { pages },
  hasNextPage,
  isFetchingNextPage: false,
  fetchNextPage: fetchNext[key],
  refetch: refetch[key],
});

const rPage = (items: unknown[], page: number, totalPages: number) => ({
  items,
  pagination: { page, per_page: 2, total: 3, total_pages: totalPages },
});
const wPage = (items: unknown[], offset: number, hasMore: boolean) => ({
  items,
  pagination: { offset, limit: 2, total: 3, has_more: hasMore },
});

/** Record numbers in rendered order, e.g. [1, 2, 3]. */
function renderedIds(pattern: RegExp): number[] {
  return screen
    .queryAllByRole("listitem")
    .map((li) => li.textContent ?? "")
    .map((t) => {
      const m = t.match(pattern);
      return m ? Number(m[1]) : null;
    })
    .filter((n): n is number => n !== null);
}

// ──────────────────────────────────────────────────────────────────────
// CardReviewsPanel — page 2 repeats review 2
// ──────────────────────────────────────────────────────────────────────

describe("CardReviewsPanel — consecutive pages share a review", () => {
  const ui = () => <CardReviewsPanel kind="validator_card" cardId={1} cardName="Ada" />;

  beforeEach(() => {
    // A review filed between the two requests pushes review 2 onto page 2.
    cardState.reviews = inf(
      [rPage([review(1), review(2)], 1, 2), rPage([review(2), review(3)], 2, 2)],
      "reviews",
      false,
    );
  });

  it("renders each review exactly once", () => {
    render(ui());
    const ids = renderedIds(/review (\d+)/);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("keeps the server order, first occurrence winning", () => {
    render(ui());
    expect(renderedIds(/review (\d+)/)).toEqual([1, 2, 3]);
  });

  it("emits no duplicate-key warning", () => {
    render(ui());
    expect(keyWarnings).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────
// CardWatchersPanel — offset 2 repeats Card 2
// ──────────────────────────────────────────────────────────────────────

describe("CardWatchersPanel — consecutive pages share a watcher", () => {
  const ui = () => (
    <CardWatchersPanel kind="validator_card" cardId={1} cardName="Ada" isClaimed />
  );

  beforeEach(() => {
    cardState.watchers = inf(
      [wPage([card(1), card(2)], 0, true), wPage([card(2), card(3)], 2, false)],
      "watchers",
      false,
    );
  });

  it("renders each watcher exactly once", () => {
    render(ui());
    const ids = renderedIds(/Card (\d+)/);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("keeps the server order, first occurrence winning", () => {
    render(ui());
    expect(renderedIds(/Card (\d+)/)).toEqual([1, 2, 3]);
  });

  it("emits no duplicate-key warning", () => {
    render(ui());
    expect(keyWarnings).toEqual([]);
  });

  it("de-duplicates the grid view too, not just the list", () => {
    render(ui());
    fireEvent.click(screen.getByRole("button", { name: /grid/i }));
    expect(screen.getByTestId("card-grid")).toHaveTextContent("3");
  });

  it("reports the server total, not the de-duplicated row count", () => {
    // `total` is the server count for the WHOLE collection. Overlap shrinks
    // what is rendered; it must not rewrite what the server said is on file.
    //
    // The two numbers are deliberately far apart. With the first fixture here
    // the total (3) happened to equal the surviving row count (3), so this
    // assertion passed even when the component was mutated to report
    // `watchers.length` — it proved nothing. 30 on file, 3 rendered.
    cardState.watchers = inf(
      [
        {
          items: [card(1), card(2)],
          pagination: { offset: 0, limit: 2, total: 30, has_more: true },
        },
        {
          items: [card(2), card(3)],
          pagination: { offset: 2, limit: 2, total: 30, has_more: false },
        },
      ],
      "watchers",
      false,
    );
    render(ui());
    expect(renderedIds(/Card (\d+)/)).toHaveLength(3);
    expect(screen.getByText(/30 ON FILE/)).toBeInTheDocument();
    expect(screen.queryByText(/^3 ON FILE/)).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────
// The cursor is unaffected by de-duplication
// ──────────────────────────────────────────────────────────────────────

describe("the cursor still advances by the server rules", () => {
  it("reviews: the next page comes from page/total_pages, not the row count", async () => {
    // Page 1 overlaps page 2, so three rows render from four returned items.
    // getNextPageParam reads the RAW page, so it still offers page 2.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/hooks/useCardTabs.ts", "utf-8"),
    );
    expect(src).toContain("lastPage.pagination.page + 1");
    expect(src).not.toContain("dedupe");
  });

  it("watchers: the next offset comes from the raw page items, not the rendered rows", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/hooks/useCardTabs.ts", "utf-8"),
    );
    expect(src).toContain("lastPage.pagination.offset + lastPage.items.length");
  });

  it("LOAD MORE is still offered while the server says there is more", () => {
    // Overlap means fewer rendered rows than items fetched; that must not be
    // read as "the list is exhausted".
    cardState.watchers = inf(
      [wPage([card(1), card(2)], 0, true), wPage([card(2), card(3)], 2, true)],
      "watchers",
      true,
    );
    render(
      <CardWatchersPanel kind="validator_card" cardId={1} cardName="Ada" isClaimed />,
    );
    expect(renderedIds(/Card (\d+)/)).toEqual([1, 2, 3]);
    const more = screen.getByRole("button", { name: /load more/i });
    fireEvent.click(more);
    expect(fetchNext.watchers).toHaveBeenCalledTimes(1);
  });
});
