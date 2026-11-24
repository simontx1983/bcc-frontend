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
import MentorsPage from "@/app/(main)/(app)/members/mentors/page";
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
    const link = await screen.findByRole("link", { name: /Search everywhere for “atom”/ });
    expect(link).toHaveAttribute("href", "/search?q=atom");
    // The roster's empty state is paper: the link must use ink to stay visible in dark mode.
    expect(link).toHaveClass("text-ink");
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
      expect(state.replace).toHaveBeenCalledWith("/members/mentors?q=leo", { scroll: false });
    } finally {
      vi.useRealTimers();
    }
  });

  it("paging keeps the search", async () => {
    state.searchParams = new URLSearchParams("q=leo");
    getMembers.mockResolvedValue(membersPage([mentor(1)], 3));
    withClient(<MentorsPage />);
    fireEvent.click(await screen.findByRole("button", { name: /next/i }));
    expect(state.replace).toHaveBeenCalledWith("/members/mentors?page=2&q=leo", { scroll: false });
  });

  it("no match with a search says so and hands off to global search", async () => {
    state.searchParams = new URLSearchParams("q=zed");
    getMembers.mockResolvedValue(membersPage([]));
    withClient(<MentorsPage />);
    expect(await screen.findByText("No mentor by that name.")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Search everywhere for “zed”/ });
    expect(link).toHaveAttribute("href", "/search?q=zed");
    expect(link).toHaveClass("text-ink");
  });

  it("no mentors at all (no search) keeps the existing empty state, no hand-off", async () => {
    getMembers.mockResolvedValue(membersPage([]));
    withClient(<MentorsPage />);
    await waitFor(() => expect(getMembers).toHaveBeenCalled());
    expect(await screen.findByText(/list themselves from their/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Search everywhere/ })).toBeNull();
  });
});

// Review follow-up (#413): a q that ARRIVES from the URL (Back / Forward, a
// link) is not typing. The debounce used to treat it as typing and, 300 ms
// later, replace the URL with page 1, dropping ?page= and overwriting that
// history entry.
describe("Back / Forward keeps the page and the history entry", () => {
  function renderWithSameClient(ui: () => ReactNode) {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const tree = () => <QueryClientProvider client={qc}>{ui()}</QueryClientProvider>;
    const view = render(tree());
    return () => view.rerender(tree());
  }

  it.each([
    ["Members", () => <MembersPage />, [{ id: 1 }]],
    ["Mentors", () => <MentorsPage />, [{ id: 1, is_mentor: true }]],
  ] as const)("%s: arriving at another q writes nothing to the URL", async (_label, ui, items) => {
    vi.useFakeTimers();
    try {
      getMembers.mockResolvedValue(membersPage([...items], 5));
      state.searchParams = new URLSearchParams("q=alpha&page=3");
      const rerender = renderWithSameClient(ui);

      // Back: the browser restores an entry with a different q, same page.
      state.searchParams = new URLSearchParams("q=beta&page=3");
      rerender();
      expect(screen.getByRole("searchbox", { name: "SEARCH" })).toHaveValue("beta");

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });
      expect(state.replace).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["Members", () => <MembersPage />, "/members?q=gamma"],
    ["Mentors", () => <MentorsPage />, "/members/mentors?q=gamma"],
  ] as const)("%s: typing still writes ?q= (page reset) after the debounce", async (_label, ui, href) => {
    vi.useFakeTimers();
    try {
      getMembers.mockResolvedValue(membersPage([{ id: 1, is_mentor: true }], 5));
      state.searchParams = new URLSearchParams("q=alpha&page=3");
      renderWithSameClient(ui);
      fireEvent.change(screen.getByRole("searchbox", { name: "SEARCH" }), { target: { value: "gamma" } });
      await act(async () => {
        vi.advanceTimersByTime(300);
      });
      expect(state.replace).toHaveBeenCalledWith(href, { scroll: false });
    } finally {
      vi.useRealTimers();
    }
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
