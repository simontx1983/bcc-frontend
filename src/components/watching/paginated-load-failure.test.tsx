/**
 * C1b — paginated read failures keep what already loaded.
 *
 * Both of these are paged, and both used to answer *any* query error by
 * replacing the entire surface. That is fine on a first load and wrong
 * afterwards: an infinite query enters `status: "error"` when a LOAD MORE
 * fails while still holding the pages it fetched, and an offset-paged
 * query that fails on page N takes the pager down with it — removing the
 * only way back to page N-1.
 *
 * These tests pin the split: full-panel failure when there is nothing to
 * lose, inline failure when there is.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { BccApiError } from "@/lib/api/types";

const refetch = { blog: vi.fn(), followers: vi.fn() };
const fetchNextPage = vi.fn();

const state = vi.hoisted(() => ({
  blog: null as unknown,
  followers: null as unknown,
}));

vi.mock("@/hooks/useUserBlog", () => ({
  useUserBlog: () => state.blog,
}));
vi.mock("@/hooks/useUserActivity", () => ({
  FOLLOWS_DEFAULT_LIMIT: 24,
  useUserFollowers: () => state.followers,
}));
// Card rendering is heavy and irrelevant here; PagerNav stays REAL so its
// presence/absence is a genuine assertion.
vi.mock("@/components/cards/CardGrid", () => ({
  CardGrid: ({ cards }: { cards: unknown[] }) => (
    <div data-testid="card-grid">{cards.length} cards</div>
  ),
}));
vi.mock("@/components/cards/CardGridSkeleton", () => ({
  CardGridSkeleton: () => <div data-testid="card-skeleton" />,
}));
vi.mock("@/components/blog/markdown/BlogMarkdownRenderer", () => ({
  BlogMarkdownRenderer: () => <div />,
}));

import { UserBlogList } from "@/components/blog/UserBlogList";
import { WatchersPanel } from "@/components/watching/WatchersPanel";

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
  refetch.blog.mockClear();
  refetch.followers.mockClear();
  fetchNextPage.mockClear();
});

afterEach(cleanup);

const err = (code: string) =>
  new BccApiError(code, "raw server text that must never render", 503, null);

// ── UserBlogList (infinite query) ─────────────────────────────────────

function blogPost(id: string) {
  return {
    id,
    author: { handle: "ada" },
    created_at: "2026-08-01T10:00:00Z",
    body: { title: `Post ${id}`, excerpt: "", full_text: "" },
    permissions: {},
  };
}

describe("UserBlogList — initial load failure", () => {
  beforeEach(() => {
    state.blog = {
      isPending: false,
      isError: true,
      error: err("bcc_unavailable"),
      data: undefined,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage,
      refetch: refetch.blog,
    };
  });

  it("shows the full failure panel with a Retry", () => {
    render(<UserBlogList handle="ada" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      /posts are temporarily unavailable/i,
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("Retry refetches the whole query", () => {
    render(<UserBlogList handle="ada" />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch.blog).toHaveBeenCalledTimes(1);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("never renders the raw server message (§γ)", () => {
    render(<UserBlogList handle="ada" />);
    expect(screen.getByRole("alert")).not.toHaveTextContent(/raw server text/i);
  });
});

describe("UserBlogList — LOAD MORE failure keeps the loaded posts", () => {
  beforeEach(() => {
    // page 1 succeeded, the next page failed — React Query reports
    // `isError` while `data` still holds page 1.
    state.blog = {
      isPending: false,
      isError: true,
      error: err("bcc_rate_limited"),
      data: { pages: [{ items: [blogPost("a"), blogPost("b")] }] },
      hasNextPage: true,
      isFetchingNextPage: false,
      fetchNextPage,
      refetch: refetch.blog,
    };
  });

  it("still renders the posts that did load", () => {
    render(<UserBlogList handle="ada" />);
    expect(screen.getAllByRole("article")).toHaveLength(2);
  });

  it("reports the failure inline rather than replacing the list", () => {
    render(<UserBlogList handle="ada" />);
    expect(screen.getByRole("alert")).toHaveTextContent(/loading too fast/i);
    // the full-panel treatment (LoadFailure's Retry) must NOT appear
    expect(screen.queryByRole("button", { name: /^retry$/i })).not.toBeInTheDocument();
  });

  it("its Try again resumes the failed page, not a whole-list refetch", () => {
    render(<UserBlogList handle="ada" />);
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
    expect(refetch.blog).not.toHaveBeenCalled();
  });

  it("hides the normal LOAD MORE button while the failure is showing", () => {
    render(<UserBlogList handle="ada" />);
    expect(screen.queryByRole("button", { name: /load more/i })).not.toBeInTheDocument();
  });
});

// ── WatchersPanel (offset paged) ──────────────────────────────────────

const PAGINATION = { total: 60, has_more: true };

describe("WatchersPanel — first load failure", () => {
  beforeEach(() => {
    state.followers = {
      isPending: false,
      isError: true,
      isSuccess: false,
      isFetching: false,
      error: err("bcc_unavailable"),
      data: undefined,
      refetch: refetch.followers,
    };
  });

  it("shows the full failure panel", () => {
    render(<WatchersPanel handle="ada" page={1} onPageChange={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      /watchers are temporarily unavailable/i,
    );
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("renders no pager — there is no earlier page to return to", () => {
    render(<WatchersPanel handle="ada" page={1} onPageChange={vi.fn()} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /prev/i })).not.toBeInTheDocument();
  });
});

describe("WatchersPanel — a failed page change keeps the pager", () => {
  it("keeps PREV/NEXT mounted so the operator can step back", () => {
    const onPageChange = vi.fn();

    // Page 1 succeeds first, seeding `lastPagination`…
    state.followers = {
      isPending: false,
      isError: false,
      isSuccess: true,
      isFetching: false,
      error: null,
      data: { items: [{ id: 1 }, { id: 2 }], pagination: PAGINATION },
      refetch: refetch.followers,
    };
    const { rerender } = render(
      <WatchersPanel handle="ada" page={1} onPageChange={onPageChange} />,
    );
    expect(screen.getByTestId("card-grid")).toBeInTheDocument();

    // …then page 2 fails. Its query key is different, so `data` is
    // undefined, but `lastPagination` survives in local state.
    state.followers = {
      isPending: false,
      isError: true,
      isSuccess: false,
      isFetching: false,
      error: err("bcc_rate_limited"),
      data: undefined,
      refetch: refetch.followers,
    };
    rerender(<WatchersPanel handle="ada" page={2} onPageChange={onPageChange} />);

    // Failure replaces only the grid…
    expect(screen.getByRole("alert")).toHaveTextContent(/loading too fast/i);
    expect(screen.queryByTestId("card-grid")).not.toBeInTheDocument();
    // …the pager is still there.
    expect(screen.getByRole("button", { name: /prev/i })).toBeInTheDocument();
  });

  it("does not mistake a failed page for an empty roster", () => {
    const onPageChange = vi.fn();
    state.followers = {
      isPending: false,
      isError: false,
      isSuccess: true,
      isFetching: false,
      error: null,
      data: { items: [{ id: 1 }], pagination: PAGINATION },
      refetch: refetch.followers,
    };
    const { rerender } = render(
      <WatchersPanel handle="ada" page={1} onPageChange={onPageChange} />,
    );

    state.followers = {
      isPending: false,
      isError: true,
      isSuccess: false,
      isFetching: false,
      error: err("bcc_unavailable"),
      data: undefined,
      refetch: refetch.followers,
    };
    rerender(<WatchersPanel handle="ada" page={2} onPageChange={onPageChange} />);

    // The "Nobody's watching you yet" terminal empty state would be a lie.
    expect(screen.queryByText(/nobody.s watching you yet/i)).not.toBeInTheDocument();
  });
});
