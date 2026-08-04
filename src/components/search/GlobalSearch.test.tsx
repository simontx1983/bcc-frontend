import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GlobalSearch } from "@/components/search/GlobalSearch";
import type { SearchSuggestion } from "@/lib/api/types";

/**
 * Cross-kind identity + stale-highlight regressions for the §G1
 * dropdown (v1.70 — the merged response can hold a member, a
 * community, and a page that share one numeric id):
 *
 *   1. member #123, community #123 and validator #123 must coexist —
 *      distinct rows, no duplicate [role=option] DOM ids, keyboard
 *      navigation landing on the row the highlight shows.
 *   2. A same-length re-rank under keepPreviousData must RESET the
 *      highlight (the reset effect keys on the ordered
 *      `${card_kind}:${id}` signature, not items.length) so Enter can
 *      never fire at a row that changed identity under the cursor.
 *   3. Community rows render no tier chip (null label suppresses it);
 *      member rows render their REAL tier chip.
 *
 * Note the fixtures are typed SearchSuggestion and OMIT `is_verified`
 * on member/community rows — that the file typechecks is itself the
 * regression test for the key's optionality (omitted ≠ false, v1.70).
 *
 * Harness notes (house style, see TourLayer.keyboard.test.tsx): no
 * vitest globals config → manual cleanup(); router + API modules
 * mocked via vi.hoisted.
 */

const hoisted = vi.hoisted(() => ({
  pushMock: vi.fn(),
  getSearchSuggestions: vi.fn(),
  getTrendingSearches: vi.fn(async () => ({ results: [], categories: [] })),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: hoisted.pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/lib/api/cards-search-endpoints", () => ({
  getSearchSuggestions: (...args: unknown[]) =>
    hoisted.getSearchSuggestions(...(args as [])),
  getTrendingSearches: (...args: unknown[]) =>
    hoisted.getTrendingSearches(...(args as [])),
}));

const validator123: SearchSuggestion = {
  id: 123,
  name: "Blacksmith Node",
  handle: "blacksmith-node",
  card_kind: "validator",
  reputation_tier: "elite",
  reputation_tier_label: "Elite",
  trust_score: 98,
  is_verified: true,
  is_claim_verified: true,
  href: "/v/blacksmith-node",
};

const community123: SearchSuggestion = {
  id: 123,
  name: "Cosmos Hall",
  handle: "cosmos-hall",
  card_kind: "community",
  reputation_tier: "neutral",
  reputation_tier_label: null,
  trust_score: null,
  is_claim_verified: false,
  href: "/halls/cosmos-hall",
};

const member123: SearchSuggestion = {
  id: 123,
  name: "Simon",
  handle: "simontx",
  card_kind: "member",
  reputation_tier: "trusted",
  reputation_tier_label: "Trusted",
  trust_score: 71,
  is_claim_verified: false,
  href: "/u/simontx",
};

const MIXED = [validator123, community123, member123];

function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={client}>
      <GlobalSearch />
    </QueryClientProvider>,
  );
  return { client, view };
}

async function typeAndWaitForRows(value: string, expectedRows: number) {
  // Both the text input AND the native scope <select> map to the
  // "combobox" role — disambiguate by accessible name.
  const input = screen.getByRole("combobox", { name: "Search BCC" });
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
  await waitFor(() => {
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(expectedRows);
  });
  return input;
}

describe("GlobalSearch cross-kind identity", () => {
  beforeEach(() => {
    hoisted.pushMock.mockReset();
    hoisted.getSearchSuggestions.mockReset();
    hoisted.getSearchSuggestions.mockResolvedValue({ items: MIXED });
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders member #123, community #123 and validator #123 as distinct rows with unique option ids", async () => {
    renderSearch();
    await typeAndWaitForRows("cosmos", 3);

    expect(screen.getByText("Blacksmith Node")).toBeInTheDocument();
    expect(screen.getByText("Cosmos Hall")).toBeInTheDocument();
    expect(screen.getByText("Simon")).toBeInTheDocument();

    const options = Array.from(document.querySelectorAll('[role="option"]'));
    const ids = options.map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("navigates to the SECOND row's href on ArrowDown ×2 + Enter", async () => {
    renderSearch();
    const input = await typeAndWaitForRows("cosmos", 3);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(hoisted.pushMock).toHaveBeenCalledTimes(1);
    expect(hoisted.pushMock).toHaveBeenCalledWith("/halls/cosmos-hall");
  });

  it("suppresses the tier chip on community rows and shows the real tier on member rows", async () => {
    renderSearch();
    await typeAndWaitForRows("cosmos", 3);

    // Member's real tier renders; the community placeholder never
    // surfaces as a literal "NEUTRAL" chip.
    expect(screen.getByText("TRUSTED")).toBeInTheDocument();
    expect(screen.queryByText("NEUTRAL")).not.toBeInTheDocument();

    // Community subtitle uses the /slug idiom, not @.
    expect(screen.getByText(/COMMUNITY · \/cosmos-hall/)).toBeInTheDocument();
    expect(screen.getByText(/MEMBER · @simontx/)).toBeInTheDocument();
  });

  it("resets the highlight when a same-length refetch reorders the list", async () => {
    const { client } = renderSearch();
    const input = await typeAndWaitForRows("cosmos", 3);

    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).not.toBeNull();

    // Same query, same length, different order — the pre-v1.70 reset
    // (keyed on items.length) kept the stale index alive here.
    hoisted.getSearchSuggestions.mockResolvedValue({
      items: [member123, community123, validator123],
    });
    await act(async () => {
      await client.refetchQueries();
    });

    await waitFor(() => {
      expect(input.getAttribute("aria-activedescendant")).toBeNull();
    });
  });

  it("passes the selected scope as the kind param and refires the query", async () => {
    renderSearch();
    await typeAndWaitForRows("cosmos", 3);

    const scope = screen.getByLabelText("Search scope");
    fireEvent.change(scope, { target: { value: "member" } });

    await waitFor(() => {
      expect(hoisted.getSearchSuggestions).toHaveBeenCalledWith(
        { q: "cosmos", kind: "member" },
        expect.anything(),
      );
    });
  });
});
