/**
 * A permanent permission denial offers no Retry; a temporary failure still does.
 *
 * ## What this pins
 *
 * #183 shipped `isPermissionDenial()` and the rule that goes with it: a
 * permission boundary does not move when the cursor does, so a Retry against
 * one can only fail the same way. The released panels withhold the control by
 * omitting `onRetry`, which renders no button at all rather than an inert one.
 *
 * The four paginated-panel PRs (#169–#172) were written before that predicate
 * existed and passed `onRetry` unconditionally at every failure branch. On a
 * 403 they rendered a button whose only possible outcome was the same 403 —
 * next to copy that ended "Try again in a moment".
 *
 * ## Why this file is per-CONTEXT rather than per-occurrence
 *
 * A textual sweep of the five components finds 18 `onRetry` matches, but they
 * are not 18 independent decisions:
 *
 *   - one of the 18 is a PROP TYPE declaration (`onRetry: () => void`), not a
 *     render site;
 *   - `CardWatchersPanel` threads ONE dispatcher through to two branches, so
 *     the parent's `onRetry={retry}` stays and the guard belongs in `Body`;
 *   - `PhotosPanel` is three different components over three different
 *     queries, two of which are UNPAGED and so have no cursor to resume.
 *
 * So the unit of truth is the render context and its recovery call — seven of
 * them — and that is what each describe block below covers.
 *
 * ## The control that matters most
 *
 * Asserting only "a denial renders no Retry" would pass against a component
 * that renders no Retry EVER. Every context therefore asserts the temporary
 * case in the same breath: the button is present AND calls the correct
 * recovery — `fetchNextPage()` for a failed next page so the same cursor is
 * re-requested, `refetch()` for a first load or a failed refresh. A mutation
 * that swaps those two stays green against a presence-only test.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const fetchNextPage = vi.fn();
const refetch = vi.fn();

/** Spy for the gate's cache removal, so the withdrawal is asserted, not assumed. */
const removeQueries = vi.hoisted(() => vi.fn());

vi.mock("@tanstack/react-query", async (importOriginal) => ({
  ...(await importOriginal<typeof ReactQueryModule>()),
  useQueryClient: () => ({ removeQueries }),
}));

const state = vi.hoisted(() => ({
  watchers: null as unknown,
  reviews: null as unknown,
  activity: null as unknown,
  albums: null as unknown,
  albumPhotos: null as unknown,
  gallery: null as unknown,
}));

vi.mock("@/hooks/useCardTabs", () => ({
  CARD_REVIEWS_QUERY_KEY_ROOT: ["entities", "reviews"],
  CARD_WATCHERS_QUERY_KEY_ROOT: ["entities", "watchers"],
  useCardWatchers: () => state.watchers,
  useCardReviews: () => state.reviews,
}));
vi.mock("@/hooks/useUserActivity", () => ({
  USER_ACTIVITY_QUERY_KEY_ROOT: ["users", "activity"],
  USER_ALBUMS_QUERY_KEY_ROOT: ["users", "albums"],
  ALBUM_PHOTOS_QUERY_KEY_ROOT: ["users", "album-photos"],
  useUserActivity: () => state.activity,
  useUserAlbums: () => state.albums,
  useAlbumPhotos: () => state.albumPhotos,
}));
vi.mock("@/hooks/useCreatorGallery", () => ({
  creatorGalleryQueryKey: (slug: string, sort?: string) => ["creator-gallery", slug, sort ?? "total_volume"],
  useCreatorGallery: () => state.gallery,
}));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("@/components/composer/Composer", () => ({ Composer: () => null }));
vi.mock("@/components/profile/LivingHeader", () => ({ LivingHeader: () => null }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/cards/CardGrid", () => ({
  CardGrid: ({ cards }: { cards: { id: number }[] }) => (
    <ul>
      {cards.map((c) => (
        <li key={c.id}>card {c.id}</li>
      ))}
    </ul>
  ),
}));
vi.mock("@/components/feed/FeedItemCard", () => ({
  FeedItemCard: ({ item }: { item: { id: number } }) => (
    <article data-testid="wall-row">post {item.id}</article>
  ),
}));

import { CardReviewsPanel } from "@/components/entity/panels/CardReviewsPanel";
import { CardWatchersPanel } from "@/components/entity/panels/CardWatchersPanel";
import { CreatorGallery } from "@/components/creator/CreatorGallery";
import { ActivityPanel } from "@/components/profile/panels/ActivityPanel";
import { PhotosPanel } from "@/components/profile/panels/PhotosPanel";
import type * as ReactQueryModule from "@tanstack/react-query";

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
  state.watchers = null;
  state.reviews = null;
  // PhotosPanel mounts AllPhotos on first render regardless of which sub-tab
  // the test is after, so this slot needs a HEALTHY default — otherwise the
  // album tests crash in a component they are not even exercising.
  state.activity = healthy([photoPage([1])]);
  state.albums = { isPending: true, isError: false, data: undefined, refetch };
  state.albumPhotos = { isPending: true, isError: false, data: undefined, refetch };
  state.gallery = null;
  fetchNextPage.mockClear();
  refetch.mockClear();
  removeQueries.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

// ─────────────────────────────────────────────────────────────────────
// Codes under test
// ─────────────────────────────────────────────────────────────────────

/**
 * All three members of `PERMISSION_DENIAL_CODES`. `bcc_blocked` is included
 * deliberately: it is in the shipped predicate's set but was absent from every
 * shipped copy map, so it is the code most likely to be forgotten here too.
 */
const DENIAL_CODES = ["bcc_forbidden", "bcc_permission_denied", "bcc_blocked"] as const;

/** Failures a Retry can genuinely clear. `bcc_unauthorized` is NOT a denial. */
const TEMPORARY_CODES = ["bcc_unavailable", "bcc_rate_limited", "bcc_unauthorized"] as const;

const apiErr = (code: string) =>
  new BccApiError(code, "raw server text that must never render", 503, null);

const retryBtn = () => screen.queryByRole("button", { name: /retry/i });
const loadMoreBtn = () => screen.queryByRole("button", { name: /load more/i });

// ─────────────────────────────────────────────────────────────────────
// Query-state fixtures — the flag combinations TanStack really produces
// ─────────────────────────────────────────────────────────────────────

type Branch = "first" | "refetch" | "next";

function inf(pages: unknown[], branch: Branch, code: string, hasNextPage = true) {
  return {
    isPending: false,
    isLoading: false,
    isError: true,
    isLoadingError: branch === "first",
    isRefetchError: branch === "refetch",
    isFetchNextPageError: branch === "next",
    error: apiErr(code),
    data: branch === "first" ? undefined : { pages },
    hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage,
    refetch,
  };
}

/** A successful infinite query — used for slots a test is not exercising. */
function healthy(pages: unknown[], hasNextPage = false) {
  return {
    isPending: false,
    isLoading: false,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    isFetchNextPageError: false,
    error: null,
    data: { pages },
    hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage,
    refetch,
  };
}

/** Unpaged read: no cursor, so `refetch` is the only recovery. */
function fixed(data: unknown, code: string) {
  return {
    isPending: false,
    isLoading: false,
    isError: true,
    error: apiErr(code),
    data,
    refetch,
  };
}

const post = (id: number) => ({ id, post_kind: "status" as const });
const feedPage = (ids: number[]) => ({
  items: ids.map(post),
  pagination: { next_cursor: "cur", has_more: true },
});

const photo = (id: number) => ({
  id,
  post_kind: "photo" as const,
  body: { photo_url: "/p/" + id + ".jpg", alt: "a" },
  links: { self: "/p/" + id },
});
const photoPage = (ids: number[]) => ({
  items: ids.map(photo),
  pagination: { next_cursor: "cur", has_more: true },
});

const card = (id: number) => ({
  id,
  name: "Card " + id,
  handle: "c" + id,
  // MemberRow reads card.crest.image_url in the default LIST view, and
  // guards the rank chip on `null`/`""` — so `rank_label` must be present
  // and null, not absent. Contract says `string | null`; `undefined` slips
  // past that guard and would crash on `.toUpperCase()`.
  crest: { image_url: null },
  rank_label: null,
});
const rosterPage = (ids: number[]) => ({
  items: ids.map(card),
  pagination: { total: 9, offset: 0, limit: 24, has_more: true },
});

const review = (id: number) => ({
  id,
  grade: "A" as const,
  text: "Review " + id,
  posted_at_label: "2 days ago",
  author: { id, handle: "r" + id, display_name: "R" + id, avatar_url: "" },
});
const reviewPage = (ids: number[]) => ({
  items: ids.map(review),
  pagination: { total: 9, page: 1, per_page: 10, total_pages: 1, has_more: true },
});

const collection = (id: number) => ({
  id,
  contract_address: "0x" + id,
  chain_slug: "ethereum",
  chain_name: "Ethereum",
  name: "Collection " + id,
  image_url: null,
  total_supply: null,
  floor_price_label: null,
  total_volume_label: null,
  unique_holders_label: null,
  explorer_url: null,
});
const galleryPage = (ids: number[]) => ({
  items: ids.map(collection),
  pagination: { page: 1, per_page: 2, total: 6, total_pages: 3, has_more: true },
  is_stale: false,
  last_refreshed_at: null,
});

const album = (id: number) => ({
  id,
  title: "Album " + id,
  description: null,
  photo_count: 2,
  cover_url: "/c/" + id + ".jpg",
  privacy: "public",
  privacy_label: "Public",
});

// Render helpers
const watchers = () =>
  render(<CardWatchersPanel kind="validator_card" cardId={7} cardName="Node" isClaimed />);
const reviews = () =>
  render(<CardReviewsPanel kind="validator_card" cardId={7} cardName="Node" />);
const wall = () => render(<ActivityPanel handle="welder" />);
const photos = () => render(<PhotosPanel handle="welder" />);
const gallery = () => render(<CreatorGallery slug="welder" creatorName="Welder" />);

/** Switch PhotosPanel to the Albums sub-tab. */
function openAlbums() {
  fireEvent.click(screen.getByRole("tab", { name: /albums/i }));
}

// ═════════════════════════════════════════════════════════════════════
// 1. CardWatchersPanel — ONE dispatcher, TWO branches (#170)
// ═════════════════════════════════════════════════════════════════════

describe("CardWatchersPanel", () => {
  describe("first load failed, nothing on screen", () => {
    it.each(DENIAL_CODES)("%s offers no Retry", (code) => {
      state.watchers = inf([], "first", code);
      watchers();
      expect(retryBtn()).toBeNull();
    });

    it.each(TEMPORARY_CODES)("%s still offers Retry, and it refetches", (code) => {
      state.watchers = inf([], "first", code);
      watchers();
      const btn = retryBtn();
      expect(btn).not.toBeNull();
      fireEvent.click(btn as HTMLElement);
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(fetchNextPage).not.toHaveBeenCalled();
    });
  });

  describe("a failed page with rows already read", () => {
    it.each(DENIAL_CODES)("%s keeps the roster but offers no Retry", (code) => {
      state.watchers = inf([rosterPage([1, 2])], "next", code);
      watchers();
      // The rows the viewer already read are NOT thrown away. (Default
      // view is the LIST, so these are MemberRow <li>s, not CardGrid.)
      expect(screen.getAllByRole("listitem")).toHaveLength(2);
      expect(retryBtn()).toBeNull();
      // And no LOAD MORE either — it would advance past the failed offset.
      expect(loadMoreBtn()).toBeNull();
    });

    it("a temporary failure retries the SAME offset via fetchNextPage", () => {
      state.watchers = inf([rosterPage([1, 2])], "next", "bcc_unavailable");
      watchers();
      fireEvent.click(retryBtn() as HTMLElement);
      // fetchNextPage re-requests the offset that failed; refetch would
      // re-run every page EXCEPT it.
      expect(fetchNextPage).toHaveBeenCalledTimes(1);
      expect(refetch).not.toHaveBeenCalled();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════
// 2. CardReviewsPanel — same shape, own copy (#170)
// ═════════════════════════════════════════════════════════════════════

describe("CardReviewsPanel", () => {
  it.each(DENIAL_CODES)("%s offers no Retry on a first-load failure", (code) => {
    state.reviews = inf([], "first", code);
    reviews();
    expect(retryBtn()).toBeNull();
  });

  it("a temporary first-load failure refetches", () => {
    state.reviews = inf([], "first", "bcc_unavailable");
    reviews();
    fireEvent.click(retryBtn() as HTMLElement);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it.each(DENIAL_CODES)("%s keeps loaded reviews and withdraws both controls", (code) => {
    state.reviews = inf([reviewPage([1, 2])], "next", code);
    reviews();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(retryBtn()).toBeNull();
    expect(loadMoreBtn()).toBeNull();
  });

  it("a temporary next-page failure retries that page", () => {
    state.reviews = inf([reviewPage([1, 2])], "next", "bcc_unavailable");
    reviews();
    fireEvent.click(retryBtn() as HTMLElement);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 3. ActivityPanel — the three-way split (#171)
// ═════════════════════════════════════════════════════════════════════

describe("ActivityPanel", () => {
  it.each(DENIAL_CODES)("%s offers no Retry on a first load", (code) => {
    state.activity = inf([], "first", code);
    wall();
    expect(retryBtn()).toBeNull();
  });

  it("a temporary first load refetches", () => {
    state.activity = inf([], "first", "bcc_unavailable");
    wall();
    fireEvent.click(retryBtn() as HTMLElement);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  describe("a failed REFRESH with the wall loaded", () => {
    it.each(DENIAL_CODES)("%s WITHDRAWS the rows and drops the cache entry", (code) => {
      // The operator's policy: the server's latest authoritative answer is
      // "you may not read this", so the app stops displaying it. The rows
      // go, not just the controls.
      state.activity = inf([feedPage([1, 2])], "refetch", code);
      wall();
      expect(screen.queryAllByTestId("wall-row")).toHaveLength(0);
      expect(retryBtn()).toBeNull();
      expect(loadMoreBtn()).toBeNull();
      expect(screen.getByRole("alert").textContent).toMatch(/can’t view this wall/i);
      // Exact, so a root-prefixed sibling is never caught by a partial match.
      expect(removeQueries).toHaveBeenCalledWith({
        queryKey: ["users", "activity", "welder"],
        exact: true,
      });
    });

    it("a temporary refresh failure keeps BOTH, and Retry refetches", () => {
      state.activity = inf([feedPage([1, 2])], "refetch", "bcc_unavailable");
      wall();
      expect(loadMoreBtn()).not.toBeNull();
      fireEvent.click(retryBtn() as HTMLElement);
      expect(refetch).toHaveBeenCalledTimes(1);
      expect(fetchNextPage).not.toHaveBeenCalled();
    });
  });

  describe("a failed NEXT PAGE", () => {
    it.each(DENIAL_CODES)("%s keeps the rows and offers nothing", (code) => {
      state.activity = inf([feedPage([1, 2])], "next", code);
      wall();
      expect(screen.getAllByTestId("wall-row")).toHaveLength(2);
      expect(retryBtn()).toBeNull();
      expect(loadMoreBtn()).toBeNull();
    });

    it("a temporary next-page failure resumes the SAME cursor", () => {
      state.activity = inf([feedPage([1, 2])], "next", "bcc_unavailable");
      wall();
      fireEvent.click(retryBtn() as HTMLElement);
      expect(fetchNextPage).toHaveBeenCalledTimes(1);
      expect(refetch).not.toHaveBeenCalled();
    });
  });
});

// ═════════════════════════════════════════════════════════════════════
// 4. PhotosPanel ▸ AllPhotos — paginated (#171)
// ═════════════════════════════════════════════════════════════════════

describe("PhotosPanel ▸ AllPhotos", () => {
  it.each(DENIAL_CODES)("%s offers no Retry on a first load", (code) => {
    state.activity = inf([], "first", code);
    photos();
    expect(retryBtn()).toBeNull();
  });

  it("a temporary first load refetches", () => {
    state.activity = inf([], "first", "bcc_unavailable");
    photos();
    fireEvent.click(retryBtn() as HTMLElement);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it.each(DENIAL_CODES)("%s WITHDRAWS the photos and drops the cache entry", (code) => {
    state.activity = inf([photoPage([1, 2])], "refetch", code);
    photos();
    expect(retryBtn()).toBeNull();
    expect(loadMoreBtn()).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/can’t see this member’s photos/i);
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: ["users", "activity", "welder"],
      exact: true,
    });
  });

  it("a temporary next-page failure resumes that cursor", () => {
    state.activity = inf([photoPage([1, 2])], "next", "bcc_unavailable");
    photos();
    fireEvent.click(retryBtn() as HTMLElement);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 5. PhotosPanel ▸ AlbumsGrid — UNPAGED (#171)
// ═════════════════════════════════════════════════════════════════════

describe("PhotosPanel ▸ AlbumsGrid (unpaged)", () => {
  it.each(DENIAL_CODES)("%s offers no Retry when nothing loaded", (code) => {
    state.albums = fixed(undefined, code);
    photos();
    openAlbums();
    expect(retryBtn()).toBeNull();
  });

  it("a temporary failure offers Retry, and there is only refetch to call", () => {
    state.albums = fixed(undefined, "bcc_unavailable");
    photos();
    openAlbums();
    fireEvent.click(retryBtn() as HTMLElement);
    // Unpaged: no cursor exists, so fetchNextPage must never be reached.
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it.each(DENIAL_CODES)("%s WITHDRAWS the loaded shelf and drops the cache entry", (code) => {
    // Unpaged: any denied read here IS a read of this same resource.
    state.albums = fixed({ items: [album(1), album(2)] }, code);
    photos();
    openAlbums();
    expect(screen.queryByRole("button", { name: /open album Album 1/i })).toBeNull();
    expect(retryBtn()).toBeNull();
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: ["users", "albums", "welder"],
      exact: true,
    });
  });
});

// ═════════════════════════════════════════════════════════════════════
// 6. PhotosPanel ▸ AlbumDetail — UNPAGED, per-album boundary (#171)
// ═════════════════════════════════════════════════════════════════════

describe("PhotosPanel ▸ AlbumDetail (unpaged)", () => {
  function openFirstAlbum() {
    // A READABLE shelf — only the album read below fails, which is the
    // reachable case: album-level permission, not member-level.
    state.albums = { isPending: false, isError: false, data: { items: [album(1)] }, refetch };
    photos();
    openAlbums();
    fireEvent.click(screen.getByRole("button", { name: /open album Album 1/i }));
  }

  it.each(DENIAL_CODES)("%s offers no Retry for a denied album", (code) => {
    state.albumPhotos = fixed(undefined, code);
    openFirstAlbum();
    expect(retryBtn()).toBeNull();
  });

  it("a temporary album failure offers Retry, which refetches", () => {
    state.albumPhotos = fixed(undefined, "bcc_unavailable");
    openFirstAlbum();
    fireEvent.click(retryBtn() as HTMLElement);
    expect(refetch).toHaveBeenCalled();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("the shelf stays readable while one album is denied", () => {
    // The reachable case: album-level permission, not member-level.
    state.albumPhotos = fixed(undefined, "bcc_forbidden");
    openFirstAlbum();
    expect(screen.getByRole("button", { name: /back to albums/i })).toBeTruthy();
    expect(retryBtn()).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════
// 7. CreatorGallery — paginated, no humanizeCode map (#172)
// ═════════════════════════════════════════════════════════════════════

describe("CreatorGallery", () => {
  it.each(DENIAL_CODES)("%s offers no Retry on a first load", (code) => {
    state.gallery = inf([], "first", code);
    gallery();
    expect(retryBtn()).toBeNull();
  });

  it("a temporary first load refetches", () => {
    state.gallery = inf([], "first", "bcc_unavailable");
    gallery();
    fireEvent.click(retryBtn() as HTMLElement);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it.each(DENIAL_CODES)("%s WITHDRAWS the tiles and drops the cache entry", (code) => {
    state.gallery = inf([galleryPage([1, 2])], "refetch", code);
    gallery();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    expect(retryBtn()).toBeNull();
    expect(loadMoreBtn()).toBeNull();
    expect(screen.getByRole("alert").textContent).toMatch(/can’t view this creator’s gallery/i);
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: ["creator-gallery", "welder", "total_volume"],
      exact: true,
    });
  });

  it("a temporary next-page failure resumes the same page param", () => {
    state.gallery = inf([galleryPage([1, 2])], "next", "bcc_unavailable");
    gallery();
    fireEvent.click(retryBtn() as HTMLElement);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(refetch).not.toHaveBeenCalled();
  });
});

// ═════════════════════════════════════════════════════════════════════
// The withdrawal policy — scope, loop safety, recovery
// ═════════════════════════════════════════════════════════════════════

describe("withdrawal is scoped to a denied read of the SAME resource", () => {
  it("a denied NEXT PAGE keeps the earlier pages and removes nothing", () => {
    // A refusal of page 2 is not a statement about page 1: those rows were
    // served under their own authorised 200.
    state.activity = inf([feedPage([1, 2])], "next", "bcc_forbidden");
    wall();
    expect(screen.getAllByTestId("wall-row")).toHaveLength(2);
    expect(removeQueries).not.toHaveBeenCalled();
  });

  it("a TRANSIENT refresh failure keeps the rows and removes nothing", () => {
    // The server never said no, so there is nothing to honour.
    state.activity = inf([feedPage([1, 2])], "refetch", "bcc_unavailable");
    wall();
    expect(screen.getAllByTestId("wall-row")).toHaveLength(2);
    expect(retryBtn()).not.toBeNull();
    expect(removeQueries).not.toHaveBeenCalled();
  });

  it.each(TEMPORARY_CODES)("%s on a refresh never withdraws", (code) => {
    state.activity = inf([feedPage([1, 2])], "refetch", code);
    wall();
    expect(screen.getAllByTestId("wall-row")).toHaveLength(2);
    expect(removeQueries).not.toHaveBeenCalled();
  });

  it("a denied FIRST load removes nothing — there is no payload to withdraw", () => {
    state.activity = inf([], "first", "bcc_forbidden");
    wall();
    expect(removeQueries).not.toHaveBeenCalled();
  });

  it("removes ONLY that resource, with exact:true", () => {
    // A partial match would also catch ["users","activity",<someone else>]
    // and every other key sharing the root.
    state.activity = inf([feedPage([1])], "refetch", "bcc_forbidden");
    wall();
    expect(removeQueries).toHaveBeenCalledTimes(1);
    expect(removeQueries).toHaveBeenCalledWith({
      queryKey: ["users", "activity", "welder"],
      exact: true,
    });
  });
});

describe("withdrawal cannot loop", () => {
  it("removes the entry exactly once, not once per render", () => {
    // removeQueries on a key that still has a mounted observer makes
    // TanStack re-create the entry and refetch — denied again, removed
    // again. The gate must unmount the query owner first and latch.
    state.activity = inf([feedPage([1, 2])], "refetch", "bcc_forbidden");
    const view = wall();
    view.rerender(<ActivityPanel handle="welder" />);
    view.rerender(<ActivityPanel handle="welder" />);
    expect(removeQueries).toHaveBeenCalledTimes(1);
  });

  it("stops consulting the query once withdrawn", () => {
    // The data component is unmounted, so nothing re-subscribes: no
    // refetch and no further page requests can be issued.
    state.activity = inf([feedPage([1, 2])], "refetch", "bcc_forbidden");
    const view = wall();
    refetch.mockClear();
    fetchNextPage.mockClear();
    view.rerender(<ActivityPanel handle="welder" />);
    expect(refetch).not.toHaveBeenCalled();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("signs nobody out and deletes no drafts", () => {
    // The only state the policy drops is this one query's payload.
    const store: Record<string, string> = { "bcc.blog.draft::welder": "unsent" };
    const spy = vi
      .spyOn(Storage.prototype, "removeItem")
      .mockImplementation((k: string) => { delete store[k]; });
    state.activity = inf([feedPage([1, 2])], "refetch", "bcc_forbidden");
    wall();
    expect(spy).not.toHaveBeenCalled();
    expect(store["bcc.blog.draft::welder"]).toBe("unsent");
    spy.mockRestore();
  });
});

describe("recovery — permission restored", () => {
  it("a remount after restoration performs a fresh authorised fetch", () => {
    state.activity = inf([feedPage([1, 2])], "refetch", "bcc_forbidden");
    const view = wall();
    expect(screen.queryAllByTestId("wall-row")).toHaveLength(0);

    // The viewer navigates away and back; permission has been restored.
    view.unmount();
    state.activity = healthy([feedPage([1, 2, 3])]);
    wall();

    // An ordinary successful render — the latch did not survive the mount.
    expect(screen.getAllByTestId("wall-row")).toHaveLength(3);
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("a DIFFERENT resource is not treated as denied", () => {
    // The latch is keyed on the resource, so another member's wall renders
    // normally even though this one was just refused.
    state.activity = inf([feedPage([1])], "refetch", "bcc_forbidden");
    const view = render(<ActivityPanel handle="welder" />);
    expect(screen.queryAllByTestId("wall-row")).toHaveLength(0);

    state.activity = healthy([feedPage([7, 8])]);
    view.rerender(<ActivityPanel handle="someone-else" />);
    expect(screen.getAllByTestId("wall-row")).toHaveLength(2);
  });
});

// ═════════════════════════════════════════════════════════════════════
// The copy must not promise what the control no longer offers
// ═════════════════════════════════════════════════════════════════════

describe("denial copy", () => {
  /**
   * The reason this is a separate block: omitting the button while leaving
   * "Try again in a moment" on screen is a worse state than the bug, because
   * it tells the viewer to do something the UI has just removed the means to
   * do. CreatorGallery is the sharpest case — it carries no `humanizeCode`
   * map at all, so without its own denial string it would always have said
   * "try again".
   */
  it.each(DENIAL_CODES)("CreatorGallery says no retry-ish thing on %s", (code) => {
    state.gallery = inf([], "first", code);
    gallery();
    const alert = screen.getByRole("alert").textContent ?? "";
    expect(alert).not.toMatch(/try again/i);
    expect(alert).toMatch(/can’t view this creator’s gallery/i);
  });

  it.each(DENIAL_CODES)("ActivityPanel says no retry-ish thing on %s", (code) => {
    state.activity = inf([], "first", code);
    wall();
    const alert = screen.getByRole("alert").textContent ?? "";
    expect(alert).not.toMatch(/try again/i);
  });

  it.each(DENIAL_CODES)("CardWatchersPanel says no retry-ish thing on %s", (code) => {
    state.watchers = inf([], "first", code);
    watchers();
    const alert = screen.getByRole("alert").textContent ?? "";
    expect(alert).not.toMatch(/try again/i);
  });

  it.each(DENIAL_CODES)("CardReviewsPanel says no retry-ish thing on %s", (code) => {
    state.reviews = inf([], "first", code);
    reviews();
    const alert = screen.getByRole("alert").textContent ?? "";
    expect(alert).not.toMatch(/try again/i);
  });

  it("a temporary failure DOES still say try again", () => {
    // The mirror assertion: the copy change must be scoped to denials, or it
    // would strip useful advice from the recoverable case.
    state.activity = inf([], "first", "bcc_unavailable");
    wall();
    expect(screen.getByRole("alert").textContent ?? "").toMatch(/try again/i);
  });

  it.each(DENIAL_CODES)("never renders the server's raw message on %s", (code) => {
    // §γ — copy is keyed on err.code; err.message is server text.
    state.activity = inf([], "first", code);
    wall();
    expect(screen.getByRole("alert").textContent ?? "").not.toMatch(/raw server text/);
  });
});

// ═════════════════════════════════════════════════════════════════════
// Anti-vacuity: the suite must be able to SEE a Retry button
// ═════════════════════════════════════════════════════════════════════

describe("the queries themselves are sound", () => {
  /**
   * Every denial assertion above is a negative. If `retryBtn()` could never
   * match — a renamed label, a changed role — the whole file would pass
   * against a component that withheld the control unconditionally. These two
   * prove the query finds a real button and a real LOAD MORE.
   */
  it("finds a Retry button when one is genuinely offered", () => {
    state.activity = inf([], "first", "bcc_unavailable");
    wall();
    expect(retryBtn()).not.toBeNull();
  });

  it("finds a LOAD MORE button when paging is genuinely available", () => {
    state.activity = inf([feedPage([1, 2])], "refetch", "bcc_unavailable");
    wall();
    expect(loadMoreBtn()).not.toBeNull();
    expect(within(loadMoreBtn() as HTMLElement).queryByRole("img")).toBeNull();
  });
});
