/**
 * C2-photos — PhotosPanel's three failure branches.
 *
 * Only ONE of the three views is paginated. `AllPhotos` is a cursor-based
 * `useInfiniteQuery`; `AlbumsGrid` and `AlbumDetail` are unpaged single
 * queries, so for them any failure is a first-load failure.
 *
 * The load-bearing distinction is in AllPhotos, where two different
 * failures need two different recoveries and a blanket `isError` is true
 * for both:
 *
 *   isLoadingError       → first fetch failed  → refetch()
 *   isFetchNextPageError → LOAD MORE failed    → fetchNextPage()
 *
 * Using refetch() for the second would discard and re-request every page
 * already loaded, so each is asserted positively AND negatively.
 *
 * `useUserActivity` is shared with ~15 other consumers and is NOT
 * modified — its infinite-query behaviour already retains `data.pages`.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const refetch = { activity: vi.fn(), albums: vi.fn(), albumPhotos: vi.fn() };
const fetchNextPage = vi.fn();

const state = vi.hoisted(() => ({
  activity: null as unknown,
  albums: null as unknown,
  albumPhotos: {} as Record<number, unknown>,
}));

// PhotosPanel reads clientEnv directly to build the PeepSo album-create
// URL, so the env module is a real product dependency here rather than a
// transitive accident. Stubbed so the test does not need a live env.
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("@/hooks/useUserActivity", () => ({
  useUserActivity: () => state.activity,
  useUserAlbums: () => state.albums,
  useAlbumPhotos: (_h: unknown, albumId: number | null) =>
    state.albumPhotos[albumId ?? 0] ?? {
      isPending: true,
      isError: false,
      isSuccess: false,
      error: null,
      data: undefined,
      refetch: refetch.albumPhotos,
    },
}));

import { PhotosPanel } from "@/components/profile/panels/PhotosPanel";

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
  for (const spy of Object.values(refetch)) spy.mockClear();
  fetchNextPage.mockClear();
  state.activity = null;
  state.albums = null;
  state.albumPhotos = {};
});

afterEach(cleanup);

const RAW = "raw server text that must never render";
const apiErr = (code: string) => new BccApiError(code, RAW, 503, null);

/** A photo-shaped activity item (isPhotoItem filters on these). */
const photo = (id: number) => ({
  id: `feed_${id}`,
  // isPhotoItem gates on post_kind === "photo" and a non-empty photo_url
  post_kind: "photo",
  created_at: "2026-08-01T10:00:00Z",
  author: { handle: "ada", display_name: "Ada" },
  permissions: {},
  // PhotoTile links via item.links.self
  links: { self: `/u/ada/post/${id}` },
  body: { photo_url: `/p/${id}.jpg`, alt: `Photo ${id}` },
});

const infinite = (
  pageItems: unknown[][],
  over: Record<string, unknown> = {},
) => ({
  isPending: false,
  isError: false,
  isLoadingError: false,
  isFetchNextPageError: false,
  isFetchingNextPage: false,
  isSuccess: true,
  error: null,
  hasNextPage: true,
  data: { pages: pageItems.map((items) => ({ items, pagination: { has_more: true } })) },
  fetchNextPage,
  refetch: refetch.activity,
  ...over,
});

const plain = (key: keyof typeof refetch, over: Record<string, unknown>) => ({
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null,
  data: undefined,
  refetch: refetch[key],
  ...over,
});

function openAlbumsTab() {
  fireEvent.click(screen.getByRole("tab", { name: /albums/i }));
}

// ── AllPhotos ─────────────────────────────────────────────────────────

describe("AllPhotos — initial-load failure", () => {
  beforeEach(() => {
    state.activity = infinite([], {
      isError: true,
      isLoadingError: true,
      isSuccess: false,
      error: apiErr("bcc_unavailable"),
      data: undefined,
      hasNextPage: false,
    });
  });

  it("renders the paper failure with sanitized copy", () => {
    render(<PhotosPanel handle="ada" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/photos are temporarily unavailable/i);
    expect(alert.className).toContain("text-ink-soft");
    expect(alert).not.toHaveTextContent(new RegExp(RAW, "i"));
  });

  it("Retry calls refetch() and never fetchNextPage()", () => {
    render(<PhotosPanel handle="ada" />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(refetch.activity).toHaveBeenCalledTimes(1);
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(refetch.albums).not.toHaveBeenCalled();
    expect(refetch.albumPhotos).not.toHaveBeenCalled();
  });

  it("renders no empty state, no grid and no LOAD MORE", () => {
    render(<PhotosPanel handle="ada" />);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/no photos/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("listitem")).not.toBeInTheDocument();
  });
});

describe("AllPhotos — failed LOAD MORE", () => {
  beforeEach(() => {
    // page 1 loaded; the next cursor failed. React Query keeps data.pages.
    state.activity = infinite([[photo(1), photo(2)]], {
      isError: true,
      isFetchNextPageError: true,
      error: apiErr("bcc_rate_limited"),
    });
  });

  it("keeps every previously loaded photo visible", () => {
    render(<PhotosPanel handle="ada" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("renders the failure at the foot of the grid", () => {
    render(<PhotosPanel handle="ada" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/loading too fast/i);
  });

  it("withdraws ordinary LOAD MORE while the cursor is failed", () => {
    render(<PhotosPanel handle="ada" />);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("Retry calls fetchNextPage() and never refetch()", () => {
    render(<PhotosPanel handle="ada" />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(refetch.activity).not.toHaveBeenCalled();
  });

  it("does not show the success-only empty state", () => {
    state.activity = infinite([[]], {
      isError: true,
      isFetchNextPageError: true,
      error: apiErr("bcc_unavailable"),
    });
    render(<PhotosPanel handle="ada" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/no photos/i)).not.toBeInTheDocument();
  });
});

describe("AllPhotos — recovery and pending", () => {
  it("appends the failed cursor exactly once, with no duplicate or skip", () => {
    state.activity = infinite([[photo(1), photo(2)]], {
      isError: true,
      isFetchNextPageError: true,
      error: apiErr("bcc_unavailable"),
    });
    const { rerender } = render(<PhotosPanel handle="ada" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    // the same cursor now succeeds — React Query appends page 2
    state.activity = infinite([[photo(1), photo(2)], [photo(3), photo(4)]]);
    rerender(<PhotosPanel handle="ada" />);

    const alts = screen
      .getAllByRole("listitem")
      .map((li) => li.textContent ?? "" + (li.querySelector("img")?.getAttribute("alt") ?? ""));
    expect(alts).toHaveLength(4);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // ordinary paging restored
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
  });

  it("a pending next page does not blank the loaded photos", () => {
    state.activity = infinite([[photo(1), photo(2)]], {
      isFetchingNextPage: true,
    });
    render(<PhotosPanel handle="ada" />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /loading/i })).toBeDisabled();
  });
});

// ── AlbumsGrid ────────────────────────────────────────────────────────

describe("AlbumsGrid — first-load failure", () => {
  beforeEach(() => {
    state.activity = infinite([[photo(1)]]);
    state.albums = plain("albums", {
      isError: true,
      error: apiErr("bcc_unavailable"),
    });
  });

  it("renders the paper failure with sanitized copy", () => {
    render(<PhotosPanel handle="ada" isOwner />);
    openAlbumsTab();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/albums are temporarily unavailable/i);
    expect(alert.className).toContain("text-ink-soft");
    expect(alert).not.toHaveTextContent(new RegExp(RAW, "i"));
  });

  it("Retry calls only useUserAlbums' refetch", () => {
    render(<PhotosPanel handle="ada" isOwner />);
    openAlbumsTab();
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(refetch.albums).toHaveBeenCalledTimes(1);
    expect(refetch.activity).not.toHaveBeenCalled();
    expect(refetch.albumPhotos).not.toHaveBeenCalled();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("suppresses the success-only empty state and keeps the shell", () => {
    render(<PhotosPanel handle="ada" isOwner />);
    openAlbumsTab();

    expect(screen.queryByText(/no albums/i)).not.toBeInTheDocument();
    // shell survives: both sub-tabs plus the owner NEW ALBUM control
    expect(screen.getByRole("tab", { name: /all/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /albums/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /new album/i })).toBeInTheDocument();
  });
});

// ── AlbumDetail ───────────────────────────────────────────────────────

const album = (id: number, title: string) => ({
  id,
  title,
  cover_url: null,
  photo_count: 3,
  // AlbumTile and AlbumDetailHeader both call privacy_label.toUpperCase()
  privacy_label: "PUBLIC",
});

describe("AlbumDetail — failure, header survival and album switching", () => {
  function openAlbum(name: RegExp) {
    render(<PhotosPanel handle="ada" />);
    openAlbumsTab();
    fireEvent.click(screen.getByRole("button", { name }));
  }

  beforeEach(() => {
    state.activity = infinite([[photo(1)]]);
    state.albums = plain("albums", {
      isSuccess: true,
      data: { items: [album(11, "Rigs"), album(22, "Sites")] },
    });
  });

  it("renders the paper failure while keeping header and back navigation", () => {
    state.albumPhotos[11] = plain("albumPhotos", {
      isError: true,
      error: apiErr("bcc_unavailable"),
    });
    openAlbum(/rigs/i);

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/photos are temporarily unavailable/i);
    expect(alert.className).toContain("text-ink-soft");
    expect(alert).not.toHaveTextContent(new RegExp(RAW, "i"));

    // context preserved
    expect(screen.getByText(/rigs/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("Retry calls only useAlbumPhotos' refetch", () => {
    state.albumPhotos[11] = plain("albumPhotos", {
      isError: true,
      error: apiErr("bcc_rate_limited"),
    });
    openAlbum(/rigs/i);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(refetch.albumPhotos).toHaveBeenCalledTimes(1);
    expect(refetch.albums).not.toHaveBeenCalled();
    expect(refetch.activity).not.toHaveBeenCalled();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("suppresses the success-only empty state during failure", () => {
    state.albumPhotos[11] = plain("albumPhotos", {
      isError: true,
      error: apiErr("bcc_unavailable"),
    });
    openAlbum(/rigs/i);
    expect(screen.queryByText(/this album is empty/i)).not.toBeInTheDocument();
  });

  it("switching albums during failure binds to the NEW album only", () => {
    state.albumPhotos[11] = plain("albumPhotos", {
      isError: true,
      error: apiErr("bcc_unavailable"),
    });
    state.albumPhotos[22] = plain("albumPhotos", {
      isSuccess: true,
      data: { items: [{ id: 901, url: "/a.jpg", alt: "A", caption: null }] },
    });

    openAlbum(/rigs/i);
    expect(screen.getByRole("alert")).toBeInTheDocument();

    // back out and pick the other album — a different albumId, so a
    // different query key: no failure or data may bleed across.
    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    fireEvent.click(screen.getByRole("button", { name: /sites/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/sites/i)).toBeInTheDocument();
  });
});

// ── refetch failures (retained data + failed refresh) ─────────────────
//
// Reachable on all three: USER_ACTIVITY is invalidated by Composer,
// useComments, useCreatePost (x3) and useSetPhotoAlt; and the client sets
// refetchOnWindowFocus:false but leaves refetchOnMount and
// refetchOnReconnect at their default `true`, so a remount with stale
// data (>30s staleTime) or a reconnect can fail with data already loaded.

describe("AllPhotos — failed REFRESH of loaded pages", () => {
  beforeEach(() => {
    state.activity = infinite([[photo(1), photo(2)]], {
      isError: true,
      isRefetchError: true,
      error: apiErr("bcc_unavailable"),
    });
  });

  it("keeps every retained photo visible", () => {
    render(<PhotosPanel handle="ada" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("shows a sanitized paper recovery control", () => {
    render(<PhotosPanel handle="ada" />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/photos are temporarily unavailable/i);
    expect(alert.className).toContain("text-ink-soft");
    expect(alert).not.toHaveTextContent(new RegExp(RAW, "i"));
  });

  it("Retry calls refetch() and never fetchNextPage()", () => {
    render(<PhotosPanel handle="ada" />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    expect(refetch.activity).toHaveBeenCalledTimes(1);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("KEEPS ordinary LOAD MORE — the retained cursor is still coherent", () => {
    // Unlike a failed next cursor, a failed refresh leaves the pages and
    // the cursor derived from them intact, so advancing cannot skip.
    render(<PhotosPanel handle="ada" />);
    expect(screen.getByRole("button", { name: /load more/i })).toBeInTheDocument();
  });

  it("suppresses the success-only empty state", () => {
    state.activity = infinite([[]], {
      isError: true,
      isRefetchError: true,
      error: apiErr("bcc_unavailable"),
    });
    render(<PhotosPanel handle="ada" />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByText(/no photos/i)).not.toBeInTheDocument();
  });

  it("recovery restores the grid without duplicating or erasing photos", () => {
    const { rerender } = render(<PhotosPanel handle="ada" />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    state.activity = infinite([[photo(1), photo(2)]]);
    rerender(<PhotosPanel handle="ada" />);

    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("AlbumsGrid — failed REFRESH of a loaded shelf", () => {
  beforeEach(() => {
    state.activity = infinite([[photo(1)]]);
    state.albums = plain("albums", {
      isError: true,
      isRefetchError: true,
      error: apiErr("bcc_unavailable"),
      data: { items: [album(11, "Rigs"), album(22, "Sites")] },
    });
  });

  it("keeps the loaded album grid visible", () => {
    render(<PhotosPanel handle="ada" />);
    openAlbumsTab();
    expect(screen.getByRole("button", { name: /rigs/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sites/i })).toBeInTheDocument();
  });

  it("shows a localized sanitized recovery and retries only its own query", () => {
    render(<PhotosPanel handle="ada" />);
    openAlbumsTab();

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/albums are temporarily unavailable/i);
    expect(alert).not.toHaveTextContent(new RegExp(RAW, "i"));

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch.albums).toHaveBeenCalledTimes(1);
    expect(refetch.activity).not.toHaveBeenCalled();
    expect(refetch.albumPhotos).not.toHaveBeenCalled();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("suppresses the empty state when a refresh fails on an empty shelf", () => {
    state.albums = plain("albums", {
      isError: true,
      isRefetchError: true,
      error: apiErr("bcc_unavailable"),
      data: { items: [] },
    });
    render(<PhotosPanel handle="ada" />);
    openAlbumsTab();
    expect(screen.queryByText(/no albums/i)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("AlbumDetail — failed REFRESH of loaded photos", () => {
  beforeEach(() => {
    state.activity = infinite([[photo(1)]]);
    state.albums = plain("albums", {
      isSuccess: true,
      data: { items: [album(11, "Rigs"), album(22, "Sites")] },
    });
    state.albumPhotos[11] = plain("albumPhotos", {
      isError: true,
      isRefetchError: true,
      error: apiErr("bcc_unavailable"),
      data: { items: [{ id: 901, url: "/a.jpg", alt: "A", caption: null }] },
    });
  });

  function openRigs() {
    render(<PhotosPanel handle="ada" />);
    openAlbumsTab();
    fireEvent.click(screen.getByRole("button", { name: /rigs/i }));
  }

  it("keeps loaded photos, header and Back visible", () => {
    openRigs();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
    expect(screen.getByText(/rigs/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /back/i })).toBeInTheDocument();
  });

  it("shows a localized sanitized recovery and retries only its own query", () => {
    openRigs();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/photos are temporarily unavailable/i);
    expect(alert).not.toHaveTextContent(new RegExp(RAW, "i"));

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch.albumPhotos).toHaveBeenCalledTimes(1);
    expect(refetch.albums).not.toHaveBeenCalled();
    expect(refetch.activity).not.toHaveBeenCalled();
  });

  it("suppresses the empty state during a failed refresh", () => {
    state.albumPhotos[11] = plain("albumPhotos", {
      isError: true,
      isRefetchError: true,
      error: apiErr("bcc_unavailable"),
      data: { items: [] },
    });
    openRigs();
    expect(screen.queryByText(/this album is empty/i)).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("switching albums rebinds cleanly and drops the old failure", () => {
    state.albumPhotos[22] = plain("albumPhotos", {
      isSuccess: true,
      data: { items: [{ id: 902, url: "/b.jpg", alt: "B", caption: null }] },
    });
    openRigs();
    expect(screen.getByRole("alert")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /back/i }));
    fireEvent.click(screen.getByRole("button", { name: /sites/i }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText(/sites/i)).toBeInTheDocument();
  });
});
