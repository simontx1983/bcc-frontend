/**
 * The per-viewer filter (blocks, hidden reposts) runs after the server cuts
 * a page, so a page can come back EMPTY while `has_more` is still true.
 * That is not an empty feed. FeedBody must not show the empty state then:
 * it fetches on, a bounded number of pages, and past the bound offers a
 * manual Load more — never an endless spin, never "the room is quiet".
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://x" } }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/feed/FeedItemCard", () => ({
  FeedItemCard: ({ item }: { item: { id: string } }) => <p data-testid="row">{item.id}</p>,
}));
vi.mock("@/components/feed/DiscoverPanel", () => ({ DiscoverPanel: () => <p>DISCOVER</p> }));

import { FeedBody } from "@/components/feed/FeedView";

const fetchNextPage = vi.fn();
const refetch = vi.fn();
const EMPTY = <p>EMPTY STATE</p>;

type Props = ComponentProps<typeof FeedBody>;

function emptyPages(n: number): Props["data"] {
  return { pages: Array.from({ length: n }, () => ({ items: [] })) };
}

function props(over: Partial<Props>): Props {
  return {
    data: emptyPages(1),
    isLoading: false,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    isFetchNextPageError: false,
    error: null,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage,
    refetch,
    emptyState: EMPTY,
    ...over,
  };
}

beforeEach(() => {
  fetchNextPage.mockReset();
  refetch.mockReset();
});
afterEach(cleanup);

describe("FeedBody — an empty page while more exist", () => {
  it("is not the empty state: it fetches the next page behind the skeleton", () => {
    render(<FeedBody {...props({ hasNextPage: true })} />);
    expect(screen.queryByText("EMPTY STATE")).toBeNull();
    expect(screen.getByLabelText("Loading the Floor")).toBeInTheDocument();
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("does not stack a second fetch while one is in flight", () => {
    render(<FeedBody {...props({ hasNextPage: true, isFetchingNextPage: true })} />);
    expect(screen.getByLabelText("Loading the Floor")).toBeInTheDocument();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("stops fetching on its own after 3 further pages, then offers Load more", () => {
    // 1 first page + 3 auto-fetched, all filtered empty, server still has more.
    render(<FeedBody {...props({ data: emptyPages(4), hasNextPage: true })} />);
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(screen.queryByText("EMPTY STATE")).toBeNull();
    expect(screen.queryByLabelText("Loading the Floor")).toBeNull();
    expect(screen.getByText("No posts to show so far.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("still fetches while under the bound (2 pages so far)", () => {
    render(<FeedBody {...props({ data: emptyPages(3), hasNextPage: true })} />);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("shows the empty state once the server has nothing more", () => {
    render(<FeedBody {...props({ data: emptyPages(2), hasNextPage: false })} />);
    expect(screen.getByText("EMPTY STATE")).toBeInTheDocument();
    expect(fetchNextPage).not.toHaveBeenCalled();
  });

  it("never auto-fetches into a failed next page", () => {
    render(
      <FeedBody
        {...props({ hasNextPage: true, isError: true, isFetchNextPageError: true, error: new Error("x") })}
      />,
    );
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(screen.queryByText("EMPTY STATE")).toBeNull();
  });

  it("a manual Load more keeps the button mounted and focused while it fetches", () => {
    const { rerender } = render(<FeedBody {...props({ data: emptyPages(4), hasNextPage: true })} />);
    const button = screen.getByRole("button", { name: "Load more" });
    button.focus();
    fireEvent.click(button);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    // The fetch is in flight: no skeleton, same button, still focused.
    rerender(<FeedBody {...props({ data: emptyPages(4), hasNextPage: true, isFetchingNextPage: true })} />);
    expect(screen.queryByLabelText("Loading the Floor")).toBeNull();
    const busy = screen.getByRole("button", { name: "Load more" });
    expect(busy).toBe(button);
    expect(document.activeElement).toBe(button);
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(busy).toHaveAttribute("aria-disabled", "true");
    expect(busy).not.toBeDisabled();
    // A second press while busy sends nothing.
    fireEvent.click(busy);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);

    // Rows arrive: the block gives way to the list.
    rerender(
      <FeedBody
        {...props({
          data: { pages: [...(emptyPages(4)?.pages ?? []), { items: [{ id: "feed_9" } as never] }] },
          hasNextPage: true,
        })}
      />,
    );
    expect(screen.queryByText("No posts to show so far.")).toBeNull();
    expect(screen.getByTestId("row")).toHaveTextContent("feed_9");
  });

  it("observes a sentinel that mounts late, when rows first arrive", () => {
    const observed: Element[] = [];
    const io: { fire?: () => void } = {};
    class FakeObserver {
      constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
        io.fire = () => cb([{ isIntersecting: true }]);
      }
      observe(el: Element) { observed.push(el); }
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
    }
    vi.stubGlobal("IntersectionObserver", FakeObserver);
    try {
      // Past the bound and empty: no sentinel yet. Every other input of the
      // observer effect (hasNextPage, isFetchingNextPage, fetchNextPage)
      // stays the same across the rerender — only the rows change.
      const { rerender } = render(<FeedBody {...props({ data: emptyPages(4), hasNextPage: true })} />);
      expect(observed).toHaveLength(0);
      rerender(
        <FeedBody
          {...props({
            data: { pages: [...(emptyPages(4)?.pages ?? []), { items: [{ id: "feed_9" } as never] }] },
            hasNextPage: true,
          })}
        />,
      );
      expect(observed).toHaveLength(1);
      io.fire?.();
      expect(fetchNextPage).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("an ordinary page with rows is unchanged", () => {
    render(
      <FeedBody
        {...props({ data: { pages: [{ items: [{ id: "feed_1" } as never] }] }, hasNextPage: true })}
      />,
    );
    expect(screen.getByTestId("row")).toHaveTextContent("feed_1");
    expect(fetchNextPage).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });
});
