/**
 * Structure A §9: the Explore pages (validators, projects, creators) all
 * render results through DirectoryResults, so it must hand the active
 * search to the grid's empty state. Pins that one pass-through.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const emptyQuery = vi.hoisted(() => ({
  isLoading: false,
  isLoadingError: false,
  isError: false,
  isRefetchError: false,
  error: null,
  data: { pages: [{ items: [], pagination: { page: 1, per_page: 24, total: 0, total_pages: 0 } }], pageParams: [1] },
  hasNextPage: false,
  isFetchingNextPage: false,
  isFetchNextPageError: false,
  failureReason: null,
  refetch: () => undefined,
  fetchNextPage: () => undefined,
}));

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example/wp-json/bcc/v1" } }));
vi.mock("@/components/cards/CardGrid", () => ({ CardGrid: () => <div data-testid="card-grid" /> }));
vi.mock("@/hooks/useDirectory", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  useDirectory: () => emptyQuery,
}));

import { DirectoryResults } from "@/components/directory/DirectoryResults";
import type { DirectoryFilters } from "@/hooks/useDirectory";

afterEach(cleanup);

function renderResults(q: string) {
  const filters = { kind: "project", tier: null, sort: "trust", q, goodStandingOnly: false, chain: null } as DirectoryFilters;
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <DirectoryResults filters={filters} />
    </QueryClientProvider>,
  );
}

describe("Explore results hand the active search to the empty state", () => {
  it("offers 'Search everywhere' for the page's own query", () => {
    renderResults("forge");
    expect(screen.getByRole("link", { name: /Search everywhere for “forge”/ })).toHaveAttribute(
      "href",
      "/search?q=forge",
    );
  });

  it("offers nothing when the page has no search", () => {
    renderResults("");
    expect(screen.queryByRole("link", { name: /Search everywhere/ })).toBeNull();
  });
});
