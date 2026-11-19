/**
 * F-421 (b): the §G1 dropdown reads /cards/search's `incomplete` flag.
 *
 * The trust half answers 200 plus `incomplete: true` when a vertical
 * (pages, communities, members) could not be read. So:
 *   - empty AND incomplete → "Suggestions unavailable right now.", never
 *     "No matches for …". No retry button: the next keystroke asks again.
 *   - rows AND incomplete → the rows, plus a quiet "Some suggestions
 *     couldn't load." note.
 *   - a missing flag (production today) or false → exactly as before.
 *   - an incomplete answer is never replayed from cache: typing the same
 *     term again asks the server again (it is `no-store` there too). A
 *     complete answer keeps its 15 s cache.
 *
 * Harness as in GlobalSearch.test.tsx: router, session and API modules
 * mocked; a real QueryClient and the real useGlobalSearch.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchSuggestion } from "@/lib/api/types";

const hoisted = vi.hoisted(() => ({
  getSearchSuggestions: vi.fn(),
  getTrendingSearches: vi.fn(async () => ({ results: [], categories: [] })),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));
vi.mock("@/lib/api/cards-search-endpoints", () => ({
  getSearchSuggestions: (...args: unknown[]) => hoisted.getSearchSuggestions(...(args as [])),
  getTrendingSearches: (...args: unknown[]) => hoisted.getTrendingSearches(...(args as [])),
}));

import {
  GlobalSearch,
  SUGGESTIONS_PARTIAL_COPY,
  SUGGESTIONS_UNAVAILABLE_COPY,
} from "@/components/search/GlobalSearch";

const validator: SearchSuggestion = {
  id: 7,
  name: "Blacksmith Node",
  handle: "blacksmith-node",
  card_kind: "validator",
  reputation_tier: "trusted",
  reputation_tier_label: "Trusted",
  trust_score: 80,
  is_verified: true,
  is_claim_verified: false,
  href: "/v/blacksmith-node",
};

function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GlobalSearch />
    </QueryClientProvider>,
  );
  const input = screen.getByRole("combobox", { name: "Search BCC" });
  fireEvent.focus(input);
  return input;
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

/** Calls the endpoint received for this exact term. */
const callsFor = (q: string) =>
  hoisted.getSearchSuggestions.mock.calls.filter((c) => (c[0] as { q: string }).q === q).length;

beforeEach(() => {
  hoisted.getSearchSuggestions.mockReset();
  window.localStorage.clear();
});
afterEach(cleanup);

describe("GlobalSearch — an incomplete answer (F-421)", () => {
  it("empty and incomplete: 'Suggestions unavailable right now.', never 'No matches', no retry button", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [], incomplete: true });
    const input = renderSearch();
    type(input, "cosmos");

    expect(await screen.findByText(SUGGESTIONS_UNAVAILABLE_COPY)).toBeInTheDocument();
    expect(screen.queryByText(/No matches for/)).toBeNull();
    expect(screen.queryByRole("button", { name: /retry|try again/i })).toBeNull();
  });

  it("control: a missing flag (production today) still reads 'No matches'", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [] });
    const input = renderSearch();
    type(input, "cosmos");

    expect(await screen.findByText("No matches for “cosmos”.")).toBeInTheDocument();
    expect(screen.queryByText(SUGGESTIONS_UNAVAILABLE_COPY)).toBeNull();
  });

  it("control: incomplete: false reads 'No matches'", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [], incomplete: false });
    const input = renderSearch();
    type(input, "cosmos");

    expect(await screen.findByText("No matches for “cosmos”.")).toBeInTheDocument();
  });

  it("rows and incomplete: the rows plus a quiet note", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [validator], incomplete: true });
    const input = renderSearch();
    type(input, "cosmos");

    expect(await screen.findByText("Blacksmith Node")).toBeInTheDocument();
    expect(screen.getByText(SUGGESTIONS_PARTIAL_COPY)).toBeInTheDocument();
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(1);
  });

  it("control: rows and complete show no note", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [validator] });
    const input = renderSearch();
    type(input, "cosmos");

    expect(await screen.findByText("Blacksmith Node")).toBeInTheDocument();
    expect(screen.queryByText(SUGGESTIONS_PARTIAL_COPY)).toBeNull();
  });

  it("typing the same term again asks again after an incomplete answer", async () => {
    hoisted.getSearchSuggestions.mockImplementation(async ({ q }: { q: string }) =>
      q === "cosmos" ? { items: [], incomplete: true } : { items: [validator] },
    );
    const input = renderSearch();
    type(input, "cosmos");
    await screen.findByText(SUGGESTIONS_UNAVAILABLE_COPY);
    type(input, "cosmo");
    await screen.findByText("Blacksmith Node");
    type(input, "cosmos");

    await waitFor(() => expect(callsFor("cosmos")).toBe(2));
  });

  it("control: a complete answer is served from cache when the term comes back", async () => {
    hoisted.getSearchSuggestions.mockImplementation(async ({ q }: { q: string }) =>
      q === "cosmos" ? { items: [validator] } : { items: [] },
    );
    const input = renderSearch();
    type(input, "cosmos");
    await screen.findByText("Blacksmith Node");
    type(input, "cosmo");
    await screen.findByText("No matches for “cosmo”.");
    type(input, "cosmos");
    await screen.findByText("Blacksmith Node");
    // Past the 200 ms debounce, with room for a request to land.
    await new Promise((r) => setTimeout(r, 400));

    expect(callsFor("cosmos")).toBe(1);
  });
});
