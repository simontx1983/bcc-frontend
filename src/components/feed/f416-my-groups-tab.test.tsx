/**
 * F-416: the home feed's tabs are For You / Watching / My Groups. Signals is
 * hidden (its code kept). My Groups reads `scope=groups`, and with nothing
 * to show it gives one neutral line and the way to Communities — never the
 * Floor's cold-start panel, and never on a failed read.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type * as UseFeedModule from "@/hooks/useFeed";
import { BccApiError } from "@/lib/api/types";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://x" } }));
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "authenticated" }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/feed/DiscoverPanel", () => ({ DiscoverPanel: () => <p>DISCOVER</p> }));
vi.mock("@/components/feed/HighlightStrip", () => ({ HighlightStrip: () => null }));

const useFeed = vi.fn();
vi.mock("@/hooks/useFeed", async (importOriginal) => ({
  ...(await importOriginal<typeof UseFeedModule>()),
  useFeed: (scope: string) => useFeed(scope),
}));

import { FeedTabs } from "@/components/feed/FeedTabs";
import { FeedView } from "@/components/feed/FeedView";

function feedResult(over: Record<string, unknown> = {}) {
  return {
    data: { pages: [{ items: [], pagination: { next_cursor: null, has_more: false } }] },
    isLoading: false,
    isError: false,
    isLoadingError: false,
    isRefetchError: false,
    isFetchNextPageError: false,
    error: null,
    isFetchingNextPage: false,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    ...over,
  };
}

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
beforeEach(() => useFeed.mockReset());
afterEach(cleanup);

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <FeedView isAuthenticated />
    </QueryClientProvider>,
  );

describe("F-416 My Groups tab", () => {
  it("offers For You / Watching / My Groups, and no Signals tab", () => {
    render(<FeedTabs active="for_you" onChange={() => {}} />);
    const names = screen.getAllByRole("tab").map((t) => t.textContent?.trim());
    expect(names).toEqual(["For You", "Watching", "My Groups"]);
    expect(screen.queryByRole("tab", { name: /Signals/ })).toBeNull();
  });

  it("selecting My Groups reads scope=groups", () => {
    useFeed.mockReturnValue(feedResult());
    mount();
    fireEvent.click(screen.getByRole("tab", { name: /My Groups/ }));
    expect(useFeed).toHaveBeenLastCalledWith("groups");
  });

  it("an empty My Groups shows the neutral line and the way to Communities", () => {
    useFeed.mockReturnValue(feedResult());
    mount();
    fireEvent.click(screen.getByRole("tab", { name: /My Groups/ }));
    expect(screen.getByText("Posts from the groups and Halls you belong to show up here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /BROWSE COMMUNITIES/ })).toHaveAttribute("href", "/communities");
    expect(screen.queryByText("DISCOVER")).toBeNull();
  });

  it("a failed membership read (503) is a retry, not the empty state", () => {
    useFeed.mockReturnValue(
      feedResult({
        data: undefined,
        isError: true,
        isLoadingError: true,
        error: new BccApiError("bcc_unavailable", "RAW", 503, null),
      }),
    );
    mount();
    fireEvent.click(screen.getByRole("tab", { name: /My Groups/ }));
    expect(screen.getByText("The feed is temporarily unavailable. Try again shortly.")).toBeInTheDocument();
    expect(screen.queryByText(/Posts from the groups and Halls/)).toBeNull();
  });

  it("For You keeps the Floor's own empty state", () => {
    useFeed.mockReturnValue(feedResult());
    mount();
    expect(screen.getByText("DISCOVER")).toBeInTheDocument();
  });
});
