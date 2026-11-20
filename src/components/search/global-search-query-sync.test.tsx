/**
 * F-260 M12 — the header search box keeps the query it searched for.
 *
 * Before: every navigation out of the box cleared it (navigateAndClose did
 * setQuery("")), and nothing read /search's ?q=, so the results page sat
 * under an empty box after a submit, a deep link, or back/forward.
 *
 * Now:
 *   - a free-text submit (Enter, VIEW ALL, a trending pick) keeps the term;
 *   - on /search the box follows ?q= (deep link, back/forward);
 *   - leaving /search clears the synced term, never text typed since;
 *   - picking a suggestion (an entity page) still clears the box;
 *   - a box holding a term while closed fetches no suggestions.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchSuggestion } from "@/lib/api/types";

const hoisted = vi.hoisted(() => ({
  pushMock: vi.fn(),
  pathname: "/",
  searchParams: new URLSearchParams(),
  getSearchSuggestions: vi.fn(),
  getTrendingSearches: vi.fn(async () => ({ results: [], categories: [] })),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => hoisted.pathname,
  useRouter: () => ({ push: hoisted.pushMock, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => hoisted.searchParams,
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));
vi.mock("@/lib/api/cards-search-endpoints", () => ({
  getSearchSuggestions: (...args: unknown[]) => hoisted.getSearchSuggestions(...(args as [])),
  getTrendingSearches: (...args: unknown[]) => hoisted.getTrendingSearches(...(args as [])),
}));

import { GlobalSearch } from "@/components/search/GlobalSearch";

const hub: SearchSuggestion = {
  id: 7,
  name: "Cosmos Hub",
  handle: "cosmos-hub",
  card_kind: "validator",
  reputation_tier: "trusted",
  reputation_tier_label: "Trusted",
  trust_score: 70,
  is_verified: true,
  is_claim_verified: true,
  href: "/v/cosmos-hub",
};

beforeEach(() => {
  hoisted.pushMock.mockReset();
  hoisted.getSearchSuggestions.mockReset();
  hoisted.getSearchSuggestions.mockResolvedValue({ items: [hub] });
  hoisted.pathname = "/";
  hoisted.searchParams = new URLSearchParams();
});
afterEach(cleanup);

function renderBox() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = () => (
    <QueryClientProvider client={client}>
      <GlobalSearch />
    </QueryClientProvider>
  );
  const view = render(ui());
  return { ...view, rerenderBox: () => view.rerender(ui()) };
}

const box = () => screen.getByRole("combobox", { name: "Search BCC" }) as HTMLInputElement;

function navigate(pathname: string, search = "") {
  hoisted.pathname = pathname;
  hoisted.searchParams = new URLSearchParams(search);
}

describe("GlobalSearch keeps its query (F-260 M12)", () => {
  it("on /search the box shows ?q= (deep link) and fetches nothing while closed", async () => {
    navigate("/search", "q=cosmos");
    renderBox();

    await waitFor(() => expect(box().value).toBe("cosmos"));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(hoisted.getSearchSuggestions).not.toHaveBeenCalled();
  });

  it("follows a new ?q= on /search (back/forward)", async () => {
    navigate("/search", "q=cosmos");
    const { rerenderBox } = renderBox();
    await waitFor(() => expect(box().value).toBe("cosmos"));

    navigate("/search", "q=osmosis");
    rerenderBox();
    await waitFor(() => expect(box().value).toBe("osmosis"));
  });

  it("leaving /search clears the synced term", async () => {
    navigate("/search", "q=cosmos");
    const { rerenderBox } = renderBox();
    await waitFor(() => expect(box().value).toBe("cosmos"));

    navigate("/p/cosmos-hub");
    rerenderBox();
    await waitFor(() => expect(box().value).toBe(""));
  });

  it("leaving /search keeps text typed since the sync", async () => {
    navigate("/search", "q=cosmos");
    const { rerenderBox } = renderBox();
    await waitFor(() => expect(box().value).toBe("cosmos"));
    fireEvent.change(box(), { target: { value: "juno" } });

    navigate("/feed");
    rerenderBox();
    await act(async () => {});
    expect(box().value).toBe("juno");
  });

  it("a free-text submit keeps the term in the box", async () => {
    renderBox();
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: " cosmos " } });
    fireEvent.keyDown(box(), { key: "Enter" });

    expect(hoisted.pushMock).toHaveBeenCalledWith("/search?q=cosmos");
    expect(box().value).toBe("cosmos");
  });

  it("VIEW ALL RESULTS keeps the term in the box", async () => {
    renderBox();
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: "cosmos" } });
    fireEvent.click(screen.getByRole("button", { name: /view all results/i }));

    expect(hoisted.pushMock).toHaveBeenCalledWith("/search?q=cosmos");
    expect(box().value).toBe("cosmos");
  });

  it("picking a suggestion still clears the box", async () => {
    renderBox();
    fireEvent.focus(box());
    fireEvent.change(box(), { target: { value: "cosmos" } });
    await waitFor(() => expect(document.querySelectorAll('[role="option"]')).toHaveLength(1));
    fireEvent.keyDown(box(), { key: "ArrowDown" });
    fireEvent.keyDown(box(), { key: "Enter" });

    expect(hoisted.pushMock).toHaveBeenCalledWith("/v/cosmos-hub");
    expect(box().value).toBe("");
  });

  it("opening the box on /search fetches suggestions for the synced term", async () => {
    navigate("/search", "q=cosmos");
    renderBox();
    await waitFor(() => expect(box().value).toBe("cosmos"));

    fireEvent.focus(box());
    await waitFor(() => expect(hoisted.getSearchSuggestions).toHaveBeenCalledTimes(1));
    expect(hoisted.getSearchSuggestions.mock.calls[0]?.[0]).toEqual({ q: "cosmos" });
  });
});
