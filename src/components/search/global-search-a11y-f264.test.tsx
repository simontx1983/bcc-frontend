/**
 * F-264 (UX Lows 1–3) — the header search combobox.
 *
 * 1. "Searching…", "No matches for …" and "Search is briefly unavailable"
 *    were plain text a screen reader never heard. An sr-only role="status"
 *    is now mounted with the control (outside the popup), empty at first,
 *    and filled with the same lines, or "N suggestions." once current rows
 *    land. The visible line no longer says "No matches" for a term during
 *    its debounce, before that term was ever asked: it says "Searching…".
 * 2. ↓/↑/Enter could open a row the box no longer answered: the previous
 *    term's rows (during the debounce, or kept as placeholder while the
 *    new term loads), or, after backspacing under 2 chars, a row that was
 *    not even rendered. The keys now act only on rows that are shown AND
 *    current; otherwise Enter is the free-text /search?q=.
 * 3. role="listbox" sat on the whole popup (recents, trending, status
 *    text, VIEW ALL), and every option wrapped a <button>. The listbox is
 *    now only the suggestions list, the combobox controls it only while it
 *    is shown, and options hold no control of their own.
 *
 * Harness as in GlobalSearch.test.tsx: router, session and API modules
 * mocked; a real QueryClient, the real useSearchTerm and useGlobalSearch.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SearchSuggestion, SearchSuggestionsResponse } from "@/lib/api/types";

const hoisted = vi.hoisted(() => ({
  push: vi.fn(),
  getSearchSuggestions: vi.fn(),
  getTrendingSearches: vi.fn(async () => ({ results: [], categories: [] })),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: hoisted.push, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));
vi.mock("@/lib/api/cards-search-endpoints", () => ({
  getSearchSuggestions: (...args: unknown[]) => hoisted.getSearchSuggestions(...(args as [])),
  getTrendingSearches: (...args: unknown[]) => hoisted.getTrendingSearches(...(args as [])),
}));

import { GlobalSearch } from "@/components/search/GlobalSearch";

function row(id: number, name: string): SearchSuggestion {
  return {
    id,
    name,
    handle: name.toLowerCase().replace(/\s+/g, "-"),
    card_kind: "validator",
    reputation_tier: "trusted",
    reputation_tier_label: "Trusted",
    trust_score: 80,
    is_verified: true,
    is_claim_verified: false,
    href: `/v/${name.toLowerCase().replace(/\s+/g, "-")}`,
  };
}
const NODE = row(7, "Blacksmith Node");
const HUB = row(8, "Cosmos Hub");

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderSearch() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <GlobalSearch />
    </QueryClientProvider>,
  );
  return screen.getByRole("combobox", { name: "Search BCC" }) as HTMLInputElement;
}

const status = () => screen.getByRole("status");
const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } });
const options = () => Array.from(document.querySelectorAll('[role="option"]'));
const callsFor = (q: string) =>
  hoisted.getSearchSuggestions.mock.calls.filter((c) => (c[0] as { q: string }).q === q).length;

/** Type a term and wait for its own answer to be on screen. */
async function typeAndSettle(input: HTMLElement, value: string, rows: number) {
  type(input, value);
  await waitFor(() => expect(callsFor(value)).toBeGreaterThan(0));
  await waitFor(() => expect(options()).toHaveLength(rows));
  await waitFor(() => expect(status().textContent).not.toBe("Searching…"));
}

beforeEach(() => {
  hoisted.push.mockReset();
  hoisted.getSearchSuggestions.mockReset();
  window.localStorage.clear();
});
afterEach(cleanup);

// ─── 1. the live region ─────────────────────────────────────────────

describe("F-264 (1) — a status region says what the results area says", () => {
  it("is mounted with the control, outside the popup, and empty before any keystroke", () => {
    const input = renderSearch();
    expect(status().textContent).toBe("");
    expect(status().getAttribute("aria-atomic")).toBe("true");
    expect(status().className).toContain("sr-only");
    fireEvent.focus(input);
    // The pre-search surface says nothing to the live region.
    expect(status().textContent).toBe("");
    expect(status().closest("[role='listbox']")).toBeNull();
  });

  it("'Searching…' through the debounce and the request, then 'N suggestions.'", async () => {
    const answer = deferred<SearchSuggestionsResponse>();
    hoisted.getSearchSuggestions.mockImplementation(() => answer.promise);
    const input = renderSearch();
    fireEvent.focus(input);
    type(input, "cosmos");
    // Debounce window: nothing asked yet. Never "No matches".
    expect(status().textContent).toBe("Searching…");
    expect(screen.queryByText(/No matches/)).toBeNull();

    await waitFor(() => expect(callsFor("cosmos")).toBe(1));
    expect(status().textContent).toBe("Searching…");

    await act(async () => answer.resolve({ items: [NODE, HUB] }));
    await waitFor(() => expect(status().textContent).toBe("2 suggestions."));
  });

  it("one row → '1 suggestion.'; an incomplete answer adds the partial note", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [NODE], incomplete: true });
    const input = renderSearch();
    fireEvent.focus(input);
    await typeAndSettle(input, "cosmos", 1);
    expect(status().textContent).toBe("1 suggestion. Some suggestions couldn't load.");
  });

  it("an empty answer → 'No matches for “cosmos”.'", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [] });
    const input = renderSearch();
    fireEvent.focus(input);
    type(input, "cosmos");
    await waitFor(() => expect(status().textContent).toBe("No matches for “cosmos”."));
  });

  it("a failed request → the unavailable line", async () => {
    hoisted.getSearchSuggestions.mockRejectedValue(new TypeError("Failed to fetch"));
    const input = renderSearch();
    fireEvent.focus(input);
    type(input, "cosmos");
    await waitFor(() =>
      expect(status().textContent).toBe("Search is briefly unavailable. Try again in a moment."),
    );
  });

  it("after an empty answer, a new term reads 'Searching…', not 'No matches' for a term never asked", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [] });
    const input = renderSearch();
    fireEvent.focus(input);
    type(input, "cosmos");
    await waitFor(() => expect(status().textContent).toBe("No matches for “cosmos”."));

    type(input, "osmosis");
    expect(screen.queryByText(/No matches for “osmosis”/)).toBeNull();
    expect(status().textContent).toBe("Searching…");
    await waitFor(() => expect(status().textContent).toBe("No matches for “osmosis”."));
  });

  it("Esc closes the popup and empties the status", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [NODE] });
    const input = renderSearch();
    fireEvent.focus(input);
    await typeAndSettle(input, "cosmos", 1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(status().textContent).toBe("");
  });
});

// ─── 2. keys act only on current, visible rows ──────────────────────

describe("F-264 (2) — ↓/↑/Enter act only on rows shown for the term typed now", () => {
  it("control: current rows → ↓ + Enter opens the row", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [NODE, HUB] });
    const input = renderSearch();
    fireEvent.focus(input);
    await typeAndSettle(input, "cosmos", 2);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options()[0]?.id);
    fireEvent.keyDown(input, { key: "Enter" });
    expect(hoisted.push).toHaveBeenCalledWith("/v/blacksmith-node");
  });

  it("during the debounce the old rows stay visible but ↓ + Enter is the free-text search", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [NODE, HUB] });
    const input = renderSearch();
    fireEvent.focus(input);
    await typeAndSettle(input, "cosmos", 2);

    type(input, "cosmox");
    expect(options()).toHaveLength(2);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(hoisted.push).toHaveBeenCalledTimes(1);
    expect(hoisted.push).toHaveBeenCalledWith("/search?q=cosmox");
  });

  it("while the new term loads under placeholder rows, ↓ + Enter is the free-text search", async () => {
    const next = deferred<SearchSuggestionsResponse>();
    hoisted.getSearchSuggestions.mockImplementation(({ q }: { q: string }) =>
      q === "cosmos" ? Promise.resolve({ items: [NODE, HUB] }) : next.promise,
    );
    const input = renderSearch();
    fireEvent.focus(input);
    await typeAndSettle(input, "cosmos", 2);

    type(input, "cosmox");
    await waitFor(() => expect(callsFor("cosmox")).toBe(1));
    // The request is in flight: the rows on screen are still "cosmos"'s.
    expect(options()).toHaveLength(2);
    expect(status().textContent).toBe("Searching…");
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(hoisted.push).toHaveBeenCalledWith("/search?q=cosmox");
    await act(async () => next.resolve({ items: [] }));
  });

  it("↓ on a closed combobox reopens it without moving the highlight; the next ↓ moves it", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [NODE, HUB] });
    const input = renderSearch();
    fireEvent.focus(input);
    await typeAndSettle(input, "cosmos", 2);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();

    fireEvent.keyDown(input, { key: "ArrowDown" });
    await waitFor(() => expect(screen.getByRole("listbox", { name: "Suggestions" })).toBeTruthy());
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe(options()[0]?.id);
  });

  it("after backspacing under 2 chars, ↓ cannot reach the hidden rows and Enter opens nothing", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [NODE, HUB] });
    const input = renderSearch();
    fireEvent.focus(input);
    await typeAndSettle(input, "co", 2);

    type(input, "c");
    // The pre-search surface replaces the rows.
    expect(options()).toHaveLength(0);
    fireEvent.keyDown(input, { key: "ArrowDown" });
    fireEvent.keyDown(input, { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBeNull();
    fireEvent.keyDown(input, { key: "Enter" });
    expect(hoisted.push).not.toHaveBeenCalled();
  });
});

// ─── 3. the listbox holds options only ──────────────────────────────

describe("F-264 (3) — the listbox is the suggestions list, and options hold no button", () => {
  it("the combobox controls the listbox only while it is shown", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [NODE, HUB] });
    const input = renderSearch();
    fireEvent.focus(input);
    // Pre-search surface: no listbox.
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(input.hasAttribute("aria-controls")).toBe(false);

    await typeAndSettle(input, "cosmos", 2);
    const listbox = screen.getByRole("listbox", { name: "Suggestions" });
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(input.getAttribute("aria-controls")).toBe(listbox.id);
  });

  it("holds only options, none with a control inside; VIEW ALL sits outside it", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [NODE, HUB], incomplete: true });
    const input = renderSearch();
    fireEvent.focus(input);
    await typeAndSettle(input, "cosmos", 2);
    const listbox = screen.getByRole("listbox", { name: "Suggestions" });

    const children = Array.from(listbox.children);
    expect(children).toHaveLength(2);
    for (const child of children) {
      expect(child.getAttribute("role")).toBe("option");
      expect(child.querySelector("button, a[href], input, [tabindex]")).toBeNull();
    }
    const viewAll = screen.getByRole("button", { name: /view all results/i });
    expect(listbox.contains(viewAll)).toBe(false);
    expect(listbox.contains(screen.getByText("Some suggestions couldn't load."))).toBe(false);
  });

  it("a click on an option opens its row", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [NODE, HUB] });
    const input = renderSearch();
    fireEvent.focus(input);
    await typeAndSettle(input, "cosmos", 2);
    fireEvent.click(screen.getByRole("option", { name: /Cosmos Hub/ }));
    expect(hoisted.push).toHaveBeenCalledWith("/v/cosmos-hub");
  });

  it("an empty answer shows its line with no listbox", async () => {
    hoisted.getSearchSuggestions.mockResolvedValue({ items: [] });
    const input = renderSearch();
    fireEvent.focus(input);
    type(input, "cosmos");
    await waitFor(() => expect(status().textContent).toBe("No matches for “cosmos”."));
    expect(screen.queryByRole("listbox")).toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });
});
