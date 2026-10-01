/**
 * CreatorGallery — consecutive pages that share a collection.
 *
 * This surface is `page` / `OFFSET` paginated over a table the page
 * itself provokes writes to: a stale row makes the endpoint dispatch an
 * async refresh, and responses are cached `public, max-age=30`, so two
 * pages can come from either side of that refresh. A row inserted before
 * the current offset shifts every later page down by one and the
 * boundary row comes back twice. Separately,
 * `CollectionRepository::getForProject` orders by the sort column with
 * no unique tiebreak, so a row can change rank between requests.
 *
 * Measured against the unmodified component with an overlapping fixture:
 *
 *     GALLERY overlap -> rows=4 [1,2,2,3] | distinct=3 | key warnings=1
 *     Encountered two children with the same key…
 *     subtitle says: "3 collections"
 *
 * Four tiles under a label reading "3 collections".
 *
 * `useInfiniteQuery` does not close this — it owns the page LIST, not the
 * records inside it — so the guarantee is made with `dedupeById` at the
 * point the pages are flattened.
 *
 * ## What is deliberately NOT claimed here
 *
 * De-duplication hides a duplicate; it cannot recover a SKIPPED row. If
 * the window shifts the other way, one collection silently never renders
 * and the server total then exceeds the rendered count. That is a
 * backend concern (a deterministic ORDER BY) recorded separately.
 *
 * ## Why this is not applied to the two sibling surfaces
 *
 * `ActivityPanel` and `PhotosPanel` both read `/users/:handle/activity`,
 * which is KEYSET paginated — `(post_date_gmt < t OR (post_date_gmt = t
 * AND act_id < id))` against a matching `ORDER BY … DESC, act_id DESC`.
 * An insertion at the head cannot shift that window, so they cannot
 * return a record twice and `dedupeById` there would be dead code
 * standing in for a guarantee nobody needs. Pinned below so a future
 * reader does not "fix" the asymmetry.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchNextPage = vi.fn();
const refetch = vi.fn();

const state = vi.hoisted(() => ({ gallery: null as unknown }));

vi.mock("@/hooks/useCreatorGallery", () => ({
  useCreatorGallery: () => state.gallery,
}));

import { CreatorGallery } from "@/components/creator/CreatorGallery";

/** React reports duplicate keys through console.error. */
let keyWarnings: string[] = [];

beforeEach(() => {
  keyWarnings = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const text = args.map(String).join(" ");
    if (/same key/i.test(text)) {
      keyWarnings.push(text);
    }
  });
  state.gallery = null;
  fetchNextPage.mockClear();
  refetch.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

const tile = (id: number, chain = "ethereum") => ({
  id,
  contract_address: "0xabc" + id,
  chain_slug: chain,
  chain_name: chain,
  name: "Collection " + id,
  image_url: null,
  total_supply: null,
  floor_price_label: null,
  total_volume_label: null,
  unique_holders_label: null,
  explorer_url: null,
});

const page = (
  ids: number[],
  pageNo: number,
  total: number,
  hasMore: boolean,
) => ({
  items: ids.map((id) => tile(id)),
  pagination: {
    page: pageNo,
    per_page: 2,
    total,
    total_pages: Math.ceil(total / 2),
    has_more: hasMore,
  },
  is_stale: false,
  last_refreshed_at: null,
});

const inf = (pages: unknown[], hasNextPage = false) => ({
  isPending: false,
  isLoading: false,
  isError: false,
  isLoadingError: false,
  isFetchNextPageError: false,
  isRefetchError: false,
  error: null,
  data: { pages },
  hasNextPage,
  isFetchingNextPage: false,
  fetchNextPage,
  refetch,
});

const ui = () => <CreatorGallery slug="welder" creatorName="Welder" />;

/** Collection numbers in rendered order, e.g. [1, 2, 3]. */
function renderedIds(): number[] {
  return screen
    .queryAllByRole("listitem")
    .map((li) => li.textContent ?? "")
    .map((t) => {
      const m = t.match(/Collection (\d+)/);
      return m ? Number(m[1]) : null;
    })
    .filter((n): n is number => n !== null);
}

// ─────────────────────────────────────────────────────────────────────
// The three properties
// ─────────────────────────────────────────────────────────────────────

describe("CreatorGallery — consecutive pages share a collection", () => {
  beforeEach(() => {
    // A collection indexed between the two requests pushes 2 onto page 2.
    state.gallery = inf([page([1, 2], 1, 3, true), page([2, 3], 2, 3, false)]);
  });

  it("renders each collection exactly once", () => {
    render(ui());
    const ids = renderedIds();
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("keeps the server order, first occurrence winning", () => {
    // The order is a RANKING (volume desc), so the earlier page owns the
    // position. Last-occurrence-wins would drop the repeated row down.
    render(ui());
    expect(renderedIds()).toEqual([1, 2, 3]);
  });

  it("emits no duplicate-key warning", () => {
    render(ui());
    expect(keyWarnings).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The total stays the server's
// ─────────────────────────────────────────────────────────────────────

describe("CreatorGallery — the subtitle reports the server total", () => {
  it("reports the server total, not the de-duplicated row count", () => {
    // The two numbers are deliberately far apart. A fixture where the
    // total happens to equal the surviving row count cannot tell the two
    // candidate values apart, and the assertion would pass even when the
    // component reports `items.length`.
    state.gallery = inf([
      page([1, 2], 1, 40, true),
      page([2, 3], 2, 40, false),
    ]);
    render(ui());
    expect(renderedIds()).toHaveLength(3);
    expect(screen.getByText(/40 collections/)).toBeInTheDocument();
    expect(screen.queryByText(/\b3 collections\b/)).toBeNull();
  });

  it("does not read a de-duplicated page as an empty gallery", () => {
    // Pathological but cheap to guard: a page that is ALL repeats leaves
    // nothing new to render. The creator still has collections.
    state.gallery = inf([page([1, 2], 1, 2, false), page([1, 2], 2, 2, false)]);
    render(ui());
    expect(renderedIds()).toEqual([1, 2]);
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────
// De-duplication must not touch the cursor
// ─────────────────────────────────────────────────────────────────────

describe("CreatorGallery — the page param still comes from the server", () => {
  it("advances by the RAW page number, never by the surviving row count", async () => {
    // Overlap means fewer rendered rows than items fetched. Walking the
    // page param by what survived would skip a record on every overlap.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync("src/hooks/useCreatorGallery.ts", "utf-8"),
    );
    expect(src).toContain("lastPage.pagination.page + 1");
    expect(src).not.toContain("dedupe");
  });

  it("keeps LOAD MORE while the server says there is more", () => {
    // Fewer rendered rows than items fetched must not read as exhausted.
    state.gallery = inf([page([1, 2], 1, 40, true), page([2, 3], 2, 40, true)], true);
    render(ui());
    expect(renderedIds()).toEqual([1, 2, 3]);
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The identity, and the surfaces deliberately left alone
// ─────────────────────────────────────────────────────────────────────

describe("CreatorGallery — record identity", () => {
  it("treats one id as one record even across chain slugs", () => {
    // `id` is the collections table's PRIMARY KEY and
    // UNIQUE KEY uq_chain_contract (chain_id, contract_address) makes it
    // 1:1 with a (chain, contract) pair — so the same id cannot be two
    // different collections, whatever the tile's composite React key
    // suggests. If that ever stops holding, this is where it shows.
    state.gallery = inf([
      { ...page([1], 1, 2, true), items: [tile(1, "ethereum")] },
      { ...page([1], 2, 2, false), items: [tile(1, "solana")] },
    ]);
    render(ui());
    expect(renderedIds()).toEqual([1]);
    expect(keyWarnings).toEqual([]);
  });

  it("does NOT de-duplicate the keyset-paginated activity surfaces", async () => {
    // ActivityPanel and PhotosPanel read /users/:handle/activity, which is
    // keyset paginated with a strict tuple predicate —
    //
    //   (post_date_gmt < %s OR (post_date_gmt = %s AND act_id < %d))
    //   ORDER BY post_date_gmt DESC, act_id DESC
    //
    // in bcc-core's PeepSoActivityRepository::getActivities. An insertion
    // at the head cannot shift that window, so two pages cannot overlap
    // and dedupeById there would be dead code dressed as a guarantee.
    // Pinned so the asymmetry reads as a decision, not an oversight.
    //
    // The SQL itself is deliberately not asserted here: it lives in
    // another repository, and bcc-frontend's CI clones this repo alone,
    // so reaching across the umbrella checkout would pass locally and
    // fail there. The backend claim belongs to a backend test.
    const fs = await import("node:fs");
    const read = (p: string) => fs.readFileSync(p, "utf-8");
    expect(read("src/components/profile/panels/ActivityPanel.tsx")).not.toContain("dedupeById");
    expect(read("src/components/profile/panels/PhotosPanel.tsx")).not.toContain("dedupeById");
  });
});
