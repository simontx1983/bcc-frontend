/**
 * F-260 M9 + M11 — /search tells the truth about loading, short terms and
 * failures.
 *
 * Real hooks against a real QueryClient; only the endpoints are mocked.
 *
 * M9 — a disabled query is not "loading". The verticals debounced from an
 * initial "" and enable at 2+ characters, so:
 *   - every first render of /search?q=… was a disabled, not-loading query,
 *     and the page said "NO MATCHES" until the debounce fired;
 *   - a one-character term (the mobile overlay sends them) never fired,
 *     so "NO MATCHES" was permanent.
 * Now the shared useSearchTerm starts from the term in hand, a new search
 * remounts the results view, and a term under the floor gets its own sheet.
 *
 * M11 — the All tab errored only when ALL three verticals failed, so a
 * failure beside two empty answers read as "Nothing found", and no error
 * state had a Retry.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  GroupSearchResponse,
  ProjectSearchResponse,
  UserSearchResponse,
} from "@/lib/api/types";
import { BccApiError } from "@/lib/api/types";

const api = vi.hoisted(() => ({
  getSearchProjects: vi.fn(),
  getSearchUsers: vi.fn(),
  getSearchGroups: vi.fn(),
  getTrendingSearches: vi.fn(),
}));
const state = vi.hoisted(() => ({ searchParams: new URLSearchParams() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => state.searchParams,
}));
vi.mock("@/lib/api/cards-search-endpoints", () => api);
// Row links resolve through toInternalHref, which reads the API origin.
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));

import { SearchResultsPage } from "@/components/search/SearchResultsPage";

const projects = (names: string[]): ProjectSearchResponse => ({
  results: names.map((name, i) => ({
    page_id: i + 1,
    page_name: name,
    page_url: `/p/${name.toLowerCase().replace(/ /g, "-")}`,
    avatar_url: "",
    trust_score: null,
    tier: null,
    endorsements: 0,
    verified: false,
    is_claim_verified: false,
    followers: 0,
    category: null,
    category_slug: null,
  })),
  categories: [],
});
const users = (handles: string[]): UserSearchResponse => ({
  results: handles.map((h, i) => ({
    id: i + 1,
    username: h,
    display_name: h,
    avatar_url: null,
    profile_url: `/u/${h}`,
  })),
  meta: { count: handles.length, query: "" },
});
const groups = (names: string[]): GroupSearchResponse => ({
  results: names.map((name, i) => ({
    id: i + 1,
    name,
    slug: name.toLowerCase(),
    description: null,
    avatar_url: null,
    group_url: `/communities/${name.toLowerCase()}`,
  })),
  meta: { count: names.length, query: "" },
});
const failure = () => new BccApiError("bcc_unavailable", "raw", 503, null);
const never = () => new Promise<never>(() => {});

beforeEach(() => {
  for (const fn of Object.values(api)) fn.mockReset();
  state.searchParams = new URLSearchParams();
});
afterEach(cleanup);

function renderPage(query: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = (q: string) => (
    <QueryClientProvider client={client}>
      <SearchResultsPage query={q} />
    </QueryClientProvider>
  );
  const view = render(ui(query));
  return { ...view, rerenderWith: (q: string) => view.rerender(ui(q)) };
}

const skeleton = () => screen.queryByRole("list", { name: "Loading search results" });

describe("/search loading and short terms (F-260 M9)", () => {
  it("the first render of a deep link is loading, never 'no matches'", () => {
    api.getSearchProjects.mockImplementation(never);
    api.getSearchUsers.mockImplementation(never);
    api.getSearchGroups.mockImplementation(never);

    renderPage("cosmos");

    // Synchronously, before any debounce could fire.
    expect(skeleton()).toBeInTheDocument();
    expect(screen.queryByText("NO MATCHES")).not.toBeInTheDocument();
  });

  it("fires the verticals for the term in hand, without waiting for a debounce", async () => {
    api.getSearchProjects.mockImplementation(never);
    api.getSearchUsers.mockImplementation(never);
    api.getSearchGroups.mockImplementation(never);

    renderPage("cosmos");
    // Flush effects and microtasks only: no timer has had time to fire.
    await act(async () => {});

    expect(api.getSearchUsers).toHaveBeenCalledTimes(1);
    expect(api.getSearchUsers.mock.calls[0]?.[0]).toEqual({ q: "cosmos" });
  });

  it("a one-character term gets the too-short sheet and fires nothing", async () => {
    renderPage("a");

    expect(screen.getByText("TYPE AT LEAST 2 CHARACTERS")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /“a” is too short to search/ })).toBeInTheDocument();
    expect(screen.queryByText("NO MATCHES")).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 300));
    expect(api.getSearchProjects).not.toHaveBeenCalled();
    expect(api.getSearchUsers).not.toHaveBeenCalled();
    expect(api.getSearchGroups).not.toHaveBeenCalled();
  });

  it("a new search never shows the previous search's rows under its header", async () => {
    api.getSearchProjects.mockResolvedValueOnce(projects(["Cosmos Hub"]));
    api.getSearchUsers.mockResolvedValueOnce(users([]));
    api.getSearchGroups.mockResolvedValueOnce(groups([]));
    const { rerenderWith } = renderPage("cosmos");
    expect(await screen.findByText("Cosmos Hub")).toBeInTheDocument();

    api.getSearchProjects.mockImplementation(never);
    api.getSearchUsers.mockImplementation(never);
    api.getSearchGroups.mockImplementation(never);
    rerenderWith("osmo");

    expect(screen.queryByText("Cosmos Hub")).not.toBeInTheDocument();
    expect(skeleton()).toBeInTheDocument();
    expect(screen.getByText("osmo")).toBeInTheDocument();
  });
});

describe("/search failures (F-260 M11)", () => {
  it("one failed vertical beside two empty ones is a failure with Retry, not 'Nothing found'", async () => {
    api.getSearchProjects.mockResolvedValue(projects([]));
    api.getSearchUsers.mockRejectedValueOnce(failure());
    api.getSearchGroups.mockResolvedValue(groups([]));
    renderPage("cosmos");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't load members. Try again in a moment.");
    expect(screen.queryByText("NO MATCHES")).not.toBeInTheDocument();

    const usersCalls = api.getSearchUsers.mock.calls.length;
    const projectCalls = api.getSearchProjects.mock.calls.length;
    const groupCalls = api.getSearchGroups.mock.calls.length;
    api.getSearchUsers.mockResolvedValueOnce(users(["ada"]));
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    // Retry refetches the failed vertical, and only it…
    await waitFor(() => expect(api.getSearchUsers.mock.calls.length).toBe(usersCalls + 1));
    expect(api.getSearchProjects.mock.calls.length).toBe(projectCalls);
    expect(api.getSearchGroups.mock.calls.length).toBe(groupCalls);
    // …and its rows arrive.
    expect(await screen.findByText("@ada")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("names every failed vertical when nothing loaded", async () => {
    api.getSearchProjects.mockRejectedValueOnce(failure());
    api.getSearchUsers.mockRejectedValueOnce(failure());
    api.getSearchGroups.mockRejectedValueOnce(failure());
    renderPage("cosmos");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load projects, members and communities. Try again in a moment.",
    );
  });

  it("rows from the verticals that answered stay, with a notice that the list is incomplete", async () => {
    api.getSearchProjects.mockResolvedValue(projects(["Cosmos Hub"]));
    api.getSearchUsers.mockRejectedValueOnce(failure());
    api.getSearchGroups.mockResolvedValue(groups(["Validators"]));
    renderPage("cosmos");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load members, so these results are incomplete.",
    );
    expect(screen.getByText("Cosmos Hub")).toBeInTheDocument();
    expect(screen.getByText("Validators")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("'Nothing found' only when every vertical answered empty", async () => {
    api.getSearchProjects.mockResolvedValue(projects([]));
    api.getSearchUsers.mockResolvedValue(users([]));
    api.getSearchGroups.mockResolvedValue(groups([]));
    renderPage("cosmos");

    expect(await screen.findByText("NO MATCHES")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("a single vertical's tab offers Retry for that vertical", async () => {
    state.searchParams = new URLSearchParams("tab=users");
    api.getSearchProjects.mockResolvedValue(projects([]));
    api.getSearchUsers.mockRejectedValueOnce(failure());
    api.getSearchGroups.mockResolvedValue(groups([]));
    renderPage("cosmos");

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't load members. Try again in a moment.",
    );
    const before = api.getSearchUsers.mock.calls.length;
    api.getSearchUsers.mockImplementation(never);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(api.getSearchUsers.mock.calls.length).toBe(before + 1));
  });

  it("the trending landing's failure offers Retry", async () => {
    api.getTrendingSearches.mockRejectedValueOnce(failure());
    renderPage("");

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    const before = api.getTrendingSearches.mock.calls.length;
    api.getTrendingSearches.mockImplementation(never);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(api.getTrendingSearches.mock.calls.length).toBe(before + 1));
  });
});

describe("/search tab label (F-264)", () => {
  it("calls the users vertical 'Members' and keeps the ?tab=users key", async () => {
    state.searchParams = new URLSearchParams("tab=users");
    api.getSearchProjects.mockImplementation(never);
    api.getSearchUsers.mockImplementation(never);
    api.getSearchGroups.mockImplementation(never);
    renderPage("cosmos");

    const tab = screen.getByRole("tab", { name: /^Members/ });
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByRole("tab", { name: /^Users/ })).not.toBeInTheDocument();
  });
});
