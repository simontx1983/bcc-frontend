/**
 * F-420 — the group wall's empty state ignored `has_more`.
 *
 * The per-viewer filter (blocks, hidden reposts) runs after the server cuts
 * a page, so a page can come back EMPTY while `has_more` is still true.
 * GroupFeedSection showed the empty room then ("Looking for its first
 * shift", "Quiet inside", "Nothing on the ranked feed yet") over a wall
 * that has posts. Now it does what the home feed does (#329, with #335's
 * follow-ups): fetch on behind the loading state, a bounded number of
 * pages, then a manual Load more that stays mounted (and keeps focus)
 * while it fetches.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_PAGE_AUTO_FETCH_LIMIT } from "@/hooks/useEmptyPageAutoFetch";

const refetch = vi.fn();
const fetchNextPage = vi.fn();
const state = vi.hoisted(() => ({ groupFeed: null as unknown, feedParam: null as string | null }));

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" },
}));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(state.feedParam === null ? "" : `feed=${state.feedParam}`),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/halls/welders",
}));
vi.mock("@/hooks/useGroupFeed", () => ({
  GROUP_FEED_QUERY_KEY_ROOT: ["groups", "feed"],
  useGroupFeed: () => state.groupFeed,
}));
vi.mock("@/components/composer/Composer", () => ({ Composer: () => null }));
vi.mock("@/components/groups/GroupPostPolicyToggle", () => ({ GroupPostPolicyToggle: () => null }));
vi.mock("@/components/feed/FeedItemCard", () => ({
  FeedItemCard: ({ item }: { item: { id: string } }) => <p data-testid="group-row">{item.id}</p>,
}));

import { GroupFeedSection } from "@/components/groups/GroupFeedSection";

const EMPTY_COPY =
  /Looking for its first shift|Empty room|First post lands here|Quiet inside|Nothing on the ranked feed yet/;
const LOADING = "Loading the floor…";
const SO_FAR = "No posts to show so far.";

function page(items: Array<{ id: string }>, hasMore: boolean) {
  return { items, pagination: { next_cursor: hasMore ? "c" : null, has_more: hasMore } };
}

function feed(over: {
  pages: number;
  hasNextPage: boolean;
  rows?: Array<{ id: string }>;
  isFetchingNextPage?: boolean;
  isError?: boolean;
  isFetchNextPageError?: boolean;
}) {
  const pages = Array.from({ length: over.pages }, (_, i) =>
    page(i === over.pages - 1 ? (over.rows ?? []) : [], over.hasNextPage),
  );
  return {
    isPending: false, isLoading: false,
    isError: over.isError ?? false,
    isLoadingError: false, isRefetchError: false,
    isFetchNextPageError: over.isFetchNextPageError ?? false,
    error: over.isError ? new Error("x") : null,
    data: { pages },
    hasNextPage: over.hasNextPage,
    isFetchingNextPage: over.isFetchingNextPage ?? false,
    fetchNextPage, refetch,
  };
}

function group(type: string, isMember: boolean) {
  return {
    id: 7, name: "Welders", type, feed_visible: true,
    viewer_membership: isMember ? { is_member: true } : null,
    can_use_public_all: false, permissions: {},
  } as never;
}

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
function tree(type = "hall", isMember = true) {
  return (
    <QueryClientProvider client={client}>
      <GroupFeedSection group={group(type, isMember)} />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  refetch.mockClear();
  fetchNextPage.mockClear();
  state.feedParam = null;
});
afterEach(cleanup);

describe("a group wall whose pages came back empty while more exist", () => {
  it.each([
    ["hall", true],
    ["nft", true],
    ["user", true],
    ["user", false],
  ])("%s wall (member=%s): not the empty room; it fetches the next page", (type, isMember) => {
    state.groupFeed = feed({ pages: 1, hasNextPage: true });
    render(tree(type, isMember));
    expect(document.body.textContent).not.toMatch(EMPTY_COPY);
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("the ranked channel too: not 'Nothing on the ranked feed yet'", () => {
    state.feedParam = "ranked";
    state.groupFeed = feed({ pages: 1, hasNextPage: true });
    render(tree());
    expect(document.body.textContent).not.toMatch(EMPTY_COPY);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("does not stack a second fetch while one is in flight", () => {
    state.groupFeed = feed({ pages: 1, hasNextPage: true, isFetchingNextPage: true });
    render(tree());
    expect(screen.getByText(LOADING)).toBeInTheDocument();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("still fetches under the bound", () => {
    state.groupFeed = feed({ pages: EMPTY_PAGE_AUTO_FETCH_LIMIT, hasNextPage: true });
    render(tree());
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("stops after the bound and offers Load more, never the empty room", () => {
    expect(EMPTY_PAGE_AUTO_FETCH_LIMIT).toBe(3);
    // The first page plus 3 fetched on their own, all filtered empty.
    state.groupFeed = feed({ pages: 1 + EMPTY_PAGE_AUTO_FETCH_LIMIT, hasNextPage: true });
    render(tree());
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(document.body.textContent).not.toMatch(EMPTY_COPY);
    expect(screen.getByText(SO_FAR)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("past the bound, Load more keeps its place and focus while it fetches", () => {
    state.groupFeed = feed({ pages: 4, hasNextPage: true });
    const view = render(tree());
    const button = screen.getByRole("button", { name: "Load more" });
    button.focus();
    fireEvent.click(button);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    state.groupFeed = feed({ pages: 4, hasNextPage: true, isFetchingNextPage: true });
    view.rerender(tree());
    const busy = screen.getByRole("button", { name: "Load more" });
    expect(busy).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).not.toBeDisabled();
    expect(screen.queryByText(LOADING)).toBeNull();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();

    fireEvent.click(busy);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("the rows replace the block once a page brings some", () => {
    state.groupFeed = feed({ pages: 4, hasNextPage: true });
    const view = render(tree());
    expect(screen.getByText(SO_FAR)).toBeInTheDocument();

    state.groupFeed = feed({ pages: 5, hasNextPage: false, rows: [{ id: "post_9" }] });
    view.rerender(tree());
    expect(screen.getByTestId("group-row")).toHaveTextContent("post_9");
    expect(screen.queryByText(SO_FAR)).toBeNull();
    expect(screen.getByText("End of the feed.")).toBeInTheDocument();
  });

  it("never auto-fetches into a failed next page", () => {
    state.groupFeed = feed({ pages: 1, hasNextPage: true, isError: true, isFetchNextPageError: true });
    render(tree());
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toMatch(EMPTY_COPY);
  });

  it("control: empty pages with nothing more is the empty room", () => {
    state.groupFeed = feed({ pages: 2, hasNextPage: false });
    render(tree());
    expect(document.body.textContent).toMatch(EMPTY_COPY);
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("the ordinary Load more under the rows keeps its place, name and focus while it fetches", () => {
    state.groupFeed = feed({ pages: 1, hasNextPage: true, rows: [{ id: "post_1" }] });
    const view = render(tree());
    const button = screen.getByRole("button", { name: "Load more" });
    button.focus();
    fireEvent.click(button);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    state.groupFeed = feed({ pages: 1, hasNextPage: true, rows: [{ id: "post_1" }], isFetchingNextPage: true });
    view.rerender(tree());
    const busy = screen.getByRole("button", { name: "Load more" });
    expect(busy).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).not.toBeDisabled();
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();

    fireEvent.click(busy);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("the ordinary Load more is an ordinary button when idle", () => {
    state.groupFeed = feed({ pages: 1, hasNextPage: true, rows: [{ id: "post_1" }] });
    render(tree());
    const button = screen.getByRole("button", { name: "Load more" });
    expect(button).toHaveAttribute("aria-busy", "false");
    expect(button).toHaveAttribute("aria-disabled", "false");
    expect(screen.queryByRole("status", { name: "Loading" })).toBeNull();
  });

  it("control: a page with rows is unchanged (no auto-fetch, the usual Load more)", () => {
    state.groupFeed = feed({ pages: 1, hasNextPage: true, rows: [{ id: "post_1" }] });
    render(tree());
    expect(screen.getByTestId("group-row")).toHaveTextContent("post_1");
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
    expect(screen.queryByText(SO_FAR)).toBeNull();
  });
});
