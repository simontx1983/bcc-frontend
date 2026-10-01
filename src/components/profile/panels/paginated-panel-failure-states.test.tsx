/**
 * A failed page must not erase the loaded list.
 *
 * Three paginated surfaces, one defect shape. `ActivityPanel` and
 * `CreatorGallery` both tested the blanket `isError` BEFORE reading
 * `data.pages`, and for an infinite query that flag is true when a LATER
 * fetch fails while every page already fetched is still in the cache.
 * Measured against the unmodified components:
 *
 *     ACTIVITY after failed LOAD MORE -> rows=0 | alert=true
 *     ACTIVITY after failed REFETCH   -> rows=0 | alert=true
 *     GALLERY  after failed LOAD MORE -> tiles=0 | LOAD MORE offered=false
 *
 * The gallery's error branch had no retry control at all, so a page
 * reload was the only recovery.
 *
 * Each surface is asserted on all three branches, positively AND
 * negatively, because the recoveries are not interchangeable:
 *
 *   isLoadingError       → refetch()        (nothing to keep)
 *   isFetchNextPageError → fetchNextPage()  (resume the SAME page param;
 *                          refetch() would discard and re-request every
 *                          page already loaded)
 *   isRefetchError       → refetch()        (fetchNextPage() would append
 *                          a page instead of refreshing)
 *
 * The hooks are driven through their flags rather than a real
 * QueryClient: these are rendering contracts, and the flag semantics
 * themselves are TanStack's, verified separately against the installed
 * infiniteQueryBehavior.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const fetchNextPage = { activity: vi.fn(), gallery: vi.fn() };
const refetch = { activity: vi.fn(), gallery: vi.fn() };

const state = vi.hoisted(() => ({
  activity: null as unknown,
  gallery: null as unknown,
}));

vi.mock("@/hooks/useUserActivity", () => ({
  useUserActivity: () => state.activity,
  useUserAlbums: () => ({ isPending: true, isError: false, data: undefined }),
  useAlbumPhotos: () => ({ isPending: true, isError: false, data: undefined }),
}));
vi.mock("@/hooks/useCreatorGallery", () => ({
  useCreatorGallery: () => state.gallery,
}));
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("@/components/composer/Composer", () => ({ Composer: () => null }));
vi.mock("@/components/profile/LivingHeader", () => ({ LivingHeader: () => null }));
vi.mock("@/components/feed/FeedItemCard", () => ({
  FeedItemCard: ({ item }: { item: { id: number } }) => (
    <article data-testid="wall-row">post {item.id}</article>
  ),
}));

import { ActivityPanel } from "@/components/profile/panels/ActivityPanel";
import { PhotosPanel } from "@/components/profile/panels/PhotosPanel";
import { CreatorGallery } from "@/components/creator/CreatorGallery";

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
  state.activity = null;
  state.gallery = null;
  fetchNextPage.activity.mockClear();
  fetchNextPage.gallery.mockClear();
  refetch.activity.mockClear();
  refetch.gallery.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
});

// ─────────────────────────────────────────────────────────────────────
// Fixtures
// ─────────────────────────────────────────────────────────────────────

type Branch = "ok" | "loading" | "next" | "refetch";

/** Same construction the sibling failure tests use. */
const apiErr = (code: string) =>
  new BccApiError(code, "raw server text that must never render", 503, null);

/**
 * The flag combination TanStack actually produces for each branch. The
 * load-bearing part is that `isError` is true for all three failures
 * while `data` survives for two of them — which is exactly what the old
 * blanket check got wrong.
 */
function inf(
  which: "activity" | "gallery",
  pages: unknown[],
  branch: Branch,
  hasNextPage = true,
) {
  const failed = branch !== "ok" && branch !== "loading";
  return {
    isPending: branch === "loading",
    isLoading: branch === "loading",
    isError: failed,
    isLoadingError: false,
    isFetchNextPageError: branch === "next",
    isRefetchError: branch === "refetch",
    error: failed ? apiErr("bcc_unavailable") : null,
    data: branch === "loading" ? undefined : { pages },
    hasNextPage,
    isFetchingNextPage: false,
    fetchNextPage: fetchNextPage[which],
    refetch: refetch[which],
  };
}

function firstLoadFailed(which: "activity" | "gallery") {
  return {
    isPending: false,
    isLoading: false,
    isError: true,
    isLoadingError: true,
    isFetchNextPageError: false,
    isRefetchError: false,
    error: apiErr("bcc_unavailable"),
    data: undefined,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: fetchNextPage[which],
    refetch: refetch[which],
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
  // Relative, so isWpMediaUrl rejects it and PhotoTile keeps a raw <img>
  // instead of next/image, which would need an allow-listed host.
  body: { photo_url: "/p/" + id + ".jpg", alt: "a" },
  links: { self: "/p/" + id },
});
const mixedPage = (items: unknown[]) => ({
  items,
  pagination: { next_cursor: "cur", has_more: true },
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
const galleryPage = (ids: number[], page: number, total: number) => ({
  items: ids.map(collection),
  pagination: { page, per_page: 2, total, total_pages: Math.ceil(total / 2), has_more: true },
  is_stale: false,
  last_refreshed_at: null,
});

const wall = () => <ActivityPanel handle="ada" />;
const gallery = () => <CreatorGallery slug="welder" creatorName="Welder" />;

// ─────────────────────────────────────────────────────────────────────
// ActivityPanel
// ─────────────────────────────────────────────────────────────────────

describe("ActivityPanel — a later failure keeps the wall", () => {
  it("keeps every loaded row when LOAD MORE fails", () => {
    state.activity = inf("activity", [feedPage([1, 2]), feedPage([3])], "next");
    render(wall());
    expect(screen.getAllByTestId("wall-row")).toHaveLength(3);
  });

  it("keeps every loaded row when a background refresh fails", () => {
    state.activity = inf("activity", [feedPage([1, 2])], "refetch");
    render(wall());
    expect(screen.getAllByTestId("wall-row")).toHaveLength(2);
  });

  it("retries a failed next page with fetchNextPage, not refetch", () => {
    state.activity = inf("activity", [feedPage([1, 2])], "next");
    render(wall());
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(fetchNextPage.activity).toHaveBeenCalledTimes(1);
    expect(refetch.activity).not.toHaveBeenCalled();
  });

  it("retries a failed refresh with refetch, not fetchNextPage", () => {
    state.activity = inf("activity", [feedPage([1, 2])], "refetch");
    render(wall());
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch.activity).toHaveBeenCalledTimes(1);
    expect(fetchNextPage.activity).not.toHaveBeenCalled();
  });

  it("retries a failed FIRST load with refetch, and keeps no rows", () => {
    state.activity = firstLoadFailed("activity");
    render(wall());
    expect(screen.queryAllByTestId("wall-row")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(refetch.activity).toHaveBeenCalledTimes(1);
    expect(fetchNextPage.activity).not.toHaveBeenCalled();
  });

  it("withdraws LOAD MORE while the next page is failed, so it cannot skip it", () => {
    state.activity = inf("activity", [feedPage([1, 2])], "next");
    render(wall());
    expect(screen.queryByRole("button", { name: /^load more$/i })).toBeNull();
  });

  it("keeps LOAD MORE after a failed refresh — that cursor is still sound", () => {
    state.activity = inf("activity", [feedPage([1, 2])], "refetch");
    render(wall());
    fireEvent.click(screen.getByRole("button", { name: /^load more$/i }));
    expect(fetchNextPage.activity).toHaveBeenCalledTimes(1);
  });

  it("withholds 'End of the wall' while a next page is failed", () => {
    // hasNextPage stays true on a failed next page, but assert the claim
    // itself: saying the wall ended is a statement about the SERVER, and
    // a failed request is not evidence for it.
    state.activity = inf("activity", [feedPage([1, 2])], "next", false);
    render(wall());
    expect(screen.queryByText(/end of the wall/i)).toBeNull();
  });

  it("still says 'End of the wall' on a clean, exhausted stream", () => {
    state.activity = inf("activity", [feedPage([1, 2])], "ok", false);
    render(wall());
    expect(screen.getByText(/end of the wall/i)).toBeInTheDocument();
  });

  it("does not read a failed refresh as a quiet wall", () => {
    state.activity = inf("activity", [{ items: [], pagination: { next_cursor: null, has_more: false } }], "refetch", false);
    render(wall());
    expect(screen.queryByText(/quiet wall/i)).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("fetches nothing on its own", () => {
    state.activity = inf("activity", [feedPage([1, 2])], "ok");
    render(wall());
    expect(fetchNextPage.activity).not.toHaveBeenCalled();
    expect(refetch.activity).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// CreatorGallery
// ─────────────────────────────────────────────────────────────────────

describe("CreatorGallery — a later failure keeps the grid", () => {
  it("keeps every loaded tile when LOAD MORE fails", () => {
    state.gallery = inf("gallery", [galleryPage([1, 2], 1, 6), galleryPage([3], 2, 6)], "next");
    render(gallery());
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
  });

  it("keeps every loaded tile when a window-focus refresh fails", () => {
    state.gallery = inf("gallery", [galleryPage([1, 2], 1, 6)], "refetch");
    render(gallery());
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("offers a retry at all — the old error panel had none", () => {
    state.gallery = inf("gallery", [galleryPage([1, 2], 1, 6)], "next");
    render(gallery());
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("retries a failed next page with fetchNextPage, not refetch", () => {
    state.gallery = inf("gallery", [galleryPage([1, 2], 1, 6)], "next");
    render(gallery());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(fetchNextPage.gallery).toHaveBeenCalledTimes(1);
    expect(refetch.gallery).not.toHaveBeenCalled();
  });

  it("retries a failed refresh with refetch, not fetchNextPage", () => {
    state.gallery = inf("gallery", [galleryPage([1, 2], 1, 6)], "refetch");
    render(gallery());
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch.gallery).toHaveBeenCalledTimes(1);
    expect(fetchNextPage.gallery).not.toHaveBeenCalled();
  });

  it("retries a failed FIRST load with refetch, and keeps no tiles", () => {
    state.gallery = firstLoadFailed("gallery");
    render(gallery());
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch.gallery).toHaveBeenCalledTimes(1);
  });

  it("withdraws LOAD MORE while the next page is failed", () => {
    state.gallery = inf("gallery", [galleryPage([1, 2], 1, 6)], "next");
    render(gallery());
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("keeps LOAD MORE after a failed refresh", () => {
    state.gallery = inf("gallery", [galleryPage([1, 2], 1, 6)], "refetch");
    render(gallery());
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(fetchNextPage.gallery).toHaveBeenCalledTimes(1);
  });

  it("does not read a failed refresh as 'Coming soon'", () => {
    state.gallery = inf(
      "gallery",
      [{ items: [], pagination: { page: 1, per_page: 12, total: 0, total_pages: 0, has_more: false }, is_stale: false, last_refreshed_at: null }],
      "refetch",
      false,
    );
    render(gallery());
    expect(screen.queryByText(/coming soon/i)).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("keeps reporting the SERVER total, not the loaded tile count", () => {
    state.gallery = inf("gallery", [galleryPage([1, 2], 1, 40)], "next");
    render(gallery());
    expect(screen.getByText(/40 collections/)).toBeInTheDocument();
  });

  it("fetches nothing on its own", () => {
    state.gallery = inf("gallery", [galleryPage([1, 2], 1, 6)], "ok");
    render(gallery());
    expect(fetchNextPage.gallery).not.toHaveBeenCalled();
    expect(refetch.gallery).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// PhotosPanel — a filtered grid over an unfiltered stream
// ─────────────────────────────────────────────────────────────────────

describe("PhotosPanel — zero photos is not the end of the stream", () => {
  const panel = () => <PhotosPanel handle="ada" />;

  it("keeps a manual LOAD MORE when the loaded pages hold no photos", () => {
    // The exact shape that used to dead-end: 20 mixed posts, none a photo,
    // has_more true. The photos are on page 2 and were unreachable.
    state.activity = inf("activity", [mixedPage([post(1), post(2)])], "ok", true);
    render(panel());
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
  });

  it("says only what is true while pages remain", () => {
    state.activity = inf("activity", [mixedPage([post(1), post(2)])], "ok", true);
    render(panel());
    expect(screen.getByText(/no photos in the posts loaded so far/i)).toBeInTheDocument();
    expect(screen.queryByText(/no photos yet/i)).toBeNull();
  });

  it("reserves 'No photos yet' for an exhausted stream", () => {
    state.activity = inf("activity", [mixedPage([post(1), post(2)])], "ok", false);
    render(panel());
    expect(screen.getByText(/no photos yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/no photos in the posts loaded so far/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /load more/i })).toBeNull();
  });

  it("does not auto-advance to go looking for photos", () => {
    state.activity = inf("activity", [mixedPage([post(1), post(2)])], "ok", true);
    render(panel());
    expect(fetchNextPage.activity).not.toHaveBeenCalled();
  });

  it("advances only when the control is pressed", () => {
    state.activity = inf("activity", [mixedPage([post(1), post(2)])], "ok", true);
    render(panel());
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    expect(fetchNextPage.activity).toHaveBeenCalledTimes(1);
  });

  it("renders the photos once a later page supplies them", () => {
    state.activity = inf(
      "activity",
      [mixedPage([post(1), post(2)]), mixedPage([photo(3), post(4)])],
      "ok",
      false,
    );
    render(panel());
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText(/no photos/i)).toBeNull();
  });

  it("withholds the owner prompt while photos may still be below", () => {
    // "Drop one from the floor composer to start" is wrong advice when
    // the member's photos are one unfetched page away.
    state.activity = inf("activity", [mixedPage([post(1)])], "ok", true);
    render(<PhotosPanel handle="ada" isOwner />);
    expect(screen.queryByText(/floor composer to start/i)).toBeNull();
  });

  it("still shows the owner prompt on a genuinely photo-less wall", () => {
    state.activity = inf("activity", [mixedPage([post(1)])], "ok", false);
    render(<PhotosPanel handle="ada" isOwner />);
    expect(screen.getByText(/floor composer to start/i)).toBeInTheDocument();
  });
});
