/**
 * Structure A §9–10 on the pages: Members and Mentors search on the SERVER
 * (q, and mentors=1 for Mentors), keep the query in ?q=, and hand an
 * empty result to the global search. The global results tabs use the
 * menu's words while keeping their ?tab= keys.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ searchParams: new URLSearchParams(), replace: vi.fn(), push: vi.fn() }));
const getMembers = vi.hoisted(() => vi.fn());
const search = vi.hoisted(() => ({
  getSearchSuggestions: vi.fn(),
  getSearchProjects: vi.fn(),
  getSearchUsers: vi.fn(),
  getSearchGroups: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: state.replace, push: state.push, refresh: vi.fn() }),
  useSearchParams: () => state.searchParams,
  usePathname: () => "/",
}));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example/wp-json/bcc/v1" } }));
vi.mock("@/lib/api/members-endpoints", () => ({ getMembers }));
vi.mock("@/lib/api/cards-search-endpoints", () => search);
vi.mock("@/components/cards/CardGrid", () => ({
  CardGrid: ({ cards }: { cards: Array<{ id: number }> }) => (
    <ul data-testid="card-grid">{cards.map((c) => <li key={c.id}>card-{c.id}</li>)}</ul>
  ),
}));

import MembersPage from "@/app/(main)/(app)/members/page";
import MentorsPage from "@/app/(main)/(app)/mentors/page";
import { SearchResultsPage } from "@/components/search/SearchResultsPage";

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
  getMembers.mockReset();
  state.replace.mockReset();
  state.push.mockReset();
  for (const fn of Object.values(search)) fn.mockReset();
  state.searchParams = new URLSearchParams();
});

afterEach(cleanup);

const COUNTS = { validator: 0, project: 0, nft: 0, dao: 0 };

function membersPage(items: Array<Record<string, unknown>>, totalPages = 1) {
  return {
    items,
    pagination: { page: 1, per_page: 24, total: items.length, total_pages: totalPages },
    type_counts: COUNTS,
  };
}

function withClient(ui: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("Members", () => {
  it("names its scope and caps the query at /members' 64", async () => {
    getMembers.mockResolvedValue(membersPage([{ id: 1 }]));
    withClient(<MembersPage />);
    const input = screen.getByRole("searchbox", { name: "SEARCH" });
    expect(input).toHaveAttribute("placeholder", "Search members by name or @handle…");
    expect(input).toHaveAttribute("maxLength", "64");
    expect(input).toHaveClass("min-h-[44px]", "text-base");
  });

  it("searches on the server with ?q=, and an empty result hands off to global search", async () => {
    state.searchParams = new URLSearchParams("q=atom");
    getMembers.mockResolvedValue(membersPage([]));
    withClient(<MembersPage />);
    await waitFor(() => expect(getMembers).toHaveBeenCalled());
    expect(getMembers.mock.calls[0]?.[0]).toMatchObject({ q: "atom" });
    expect(await screen.findByRole("link", { name: /Search everywhere for “atom”/ })).toHaveAttribute(
      "href",
      "/search?q=atom",
    );
  });

  it("an empty roster with no search offers no hand-off", async () => {
    getMembers.mockResolvedValue(membersPage([]));
    withClient(<MembersPage />);
    expect(await screen.findByText("No members on file yet.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Search everywhere/ })).toBeNull();
  });
});

describe("Mentors (gains the field)", () => {
  const mentor = (id: number) => ({ id, is_mentor: true });

  it("names its scope, capped at 64", async () => {
    getMembers.mockResolvedValue(membersPage([mentor(1)]));
    withClient(<MentorsPage />);
    const input = screen.getByRole("searchbox", { name: "SEARCH" });
    expect(input).toHaveAttribute("placeholder", "Search mentors by name or @handle…");
    expect(input).toHaveAttribute("maxLength", "64");
  });

  it("sends q from the URL to the server together with mentors=1", async () => {
    state.searchParams = new URLSearchParams("q=leo");
    getMembers.mockResolvedValue(membersPage([mentor(1)]));
    withClient(<MentorsPage />);
    await waitFor(() => expect(getMembers).toHaveBeenCalled());
    expect(getMembers.mock.calls[0]?.[0]).toMatchObject({ q: "leo", mentors: true });
    expect(screen.getByRole("searchbox", { name: "SEARCH" })).toHaveValue("leo");
  });

  it("typing writes ?q= to the URL after the debounce (page reset to 1)", async () => {
    vi.useFakeTimers();
    try {
      getMembers.mockResolvedValue(membersPage([mentor(1)]));
      withClient(<MentorsPage />);
      fireEvent.change(screen.getByRole("searchbox", { name: "SEARCH" }), { target: { value: "leo" } });
      expect(state.replace).not.toHaveBeenCalled();
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(state.replace).toHaveBeenCalledWith("/mentors?q=leo", { scroll: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("paging keeps the search", async () => {
    state.searchParams = new URLSearchParams("q=leo");
    getMembers.mockResolvedValue(membersPage([mentor(1)], 3));
    withClient(<MentorsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /next/i }));
    expect(state.replace).toHaveBeenCalledWith("/mentors?page=2&q=leo", { scroll: false });
  });

  it("no match with a search says so and hands off to global search", async () => {
    state.searchParams = new URLSearchParams("q=zed");
    getMembers.mockResolvedValue(membersPage([]));
    withClient(<MentorsPage />);
    expect(await screen.findByText("No mentor by that name.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Search everywhere for “zed”/ })).toHaveAttribute(
      "href",
      "/search?q=zed",
    );
  });

  it("no mentors at all (no search) keeps the existing empty state, no hand-off", async () => {
    getMembers.mockResolvedValue(membersPage([]));
    withClient(<MentorsPage />);
    await waitFor(() => expect(getMembers).toHaveBeenCalled());
    expect(await screen.findByText(/list themselves from their/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Search everywhere/ })).toBeNull();
  });
});

describe("Global search results: the tabs use the menu's words (Structure A §10)", () => {
  it("reads All · Explore · Members · Communities", async () => {
    const never = () => new Promise<never>(() => {});
    for (const fn of Object.values(search)) fn.mockImplementation(never);
    state.searchParams = new URLSearchParams("q=atom");
    withClient(<SearchResultsPage query="atom" />);
    const tabs = screen.getAllByRole("tab").map((t) => t.textContent?.replace(/\d+/g, "").trim());
    expect(tabs).toEqual(["All", "Explore", "Members", "Communities"]);
    expect(screen.queryByRole("tab", { name: /Projects/ })).toBeNull();
  });

  it("keeps the ?tab=projects key for Explore, so old links still work", async () => {
    const never = () => new Promise<never>(() => {});
    for (const fn of Object.values(search)) fn.mockImplementation(never);
    state.searchParams = new URLSearchParams("q=atom&tab=projects");
    withClient(<SearchResultsPage query="atom" />);
    expect(screen.getByRole("tab", { name: /Explore/ })).toHaveAttribute("aria-selected", "true");
  });
});
