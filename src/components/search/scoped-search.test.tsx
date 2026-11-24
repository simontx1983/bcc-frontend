/**
 * Structure A §9: one scoped search field per section page, and a
 * "Search everywhere" hand-off when it finds nothing. These pin the two
 * shared pieces and the Explore-side wiring (today's /directory and
 * /validators filter panels and their shared results grid).
 */

import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example/wp-json/bcc/v1" } }));
vi.mock("@/components/cards/CardGrid", () => ({ CardGrid: () => <div data-testid="card-grid" /> }));

import { DirectoryFilters } from "@/components/directory/DirectoryFilters";
import { DirectoryGrid } from "@/components/directory/DirectoryGrid";
import { ValidatorFilters } from "@/components/directory/ValidatorFilters";
import { ScopedSearchField } from "@/components/search/ScopedSearchField";
import { SearchEverywhereLink } from "@/components/search/SearchEverywhereLink";
import type { DirectoryFilters as Filters } from "@/hooks/useDirectory";
import type { BccApiError, CardsListResponse } from "@/lib/api/types";

afterEach(cleanup);

const FILTERS: Filters = {
  kind: null,
  tier: null,
  sort: "trust",
  q: "",
  goodStandingOnly: false,
  chain: null,
} as Filters;

describe("ScopedSearchField", () => {
  function field(value: string) {
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(
      <ScopedSearchField
        label="SEARCH"
        placeholder="Search validators…"
        value={value}
        onChange={onChange}
        onClear={onClear}
        maxLength={100}
      />,
    );
    return { onChange, onClear, input: screen.getByRole("searchbox", { name: "SEARCH" }) };
  }

  it("is 44px tall with 16px text, so phones don't zoom into it", () => {
    const { input } = field("");
    expect(input).toHaveClass("min-h-[44px]");
    expect(input).toHaveClass("text-base");
    expect(input).not.toHaveClass("text-sm");
  });

  it("names its scope and carries the server's cap", () => {
    const { input } = field("");
    expect(input).toHaveAttribute("placeholder", "Search validators…");
    expect(input).toHaveAttribute("maxLength", "100");
  });

  it("reports each change", () => {
    const { input, onChange } = field("");
    fireEvent.change(input, { target: { value: "red lion" } });
    expect(onChange).toHaveBeenCalledWith("red lion");
  });

  it("offers a 44px clear button only while there is text", () => {
    field("");
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
    cleanup();
    const { onClear } = field("red");
    const clear = screen.getByRole("button", { name: "Clear search" });
    expect(clear).toHaveClass("h-[44px]", "w-[44px]");
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe("SearchEverywhereLink", () => {
  it("hands the same words to the global search", () => {
    render(<SearchEverywhereLink query="  leo  " />);
    const link = screen.getByRole("link", { name: /Search everywhere for “leo”/ });
    expect(link).toHaveAttribute("href", "/search?q=leo");
  });

  it("encodes the query", () => {
    render(<SearchEverywhereLink query="a&b c" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/search?q=a%26b%20c");
  });

  it("renders nothing without a search", () => {
    const { container } = render(<SearchEverywhereLink query="   " />);
    expect(container).toBeEmptyDOMElement();
  });

  // Paper (bcc-paper) stays light in both themes: the app colour would
  // vanish on it in dark mode, so the paper variant uses ink.
  it("uses ink on a paper surface and the app colour elsewhere", () => {
    render(<SearchEverywhereLink query="leo" surface="paper" />);
    expect(screen.getByRole("link")).toHaveClass("text-ink");
    expect(screen.getByRole("link")).not.toHaveClass("text-bcc-text");
    cleanup();
    render(<SearchEverywhereLink query="leo" />);
    expect(screen.getByRole("link")).toHaveClass("text-bcc-text");
  });
});

describe("Explore: the /directory filter panel", () => {
  it.each([
    [null, "Search pages…"],
    ["validator", "Search validators…"],
    ["project", "Search projects…"],
    ["creator", "Search creators…"],
  ] as const)("kind %s → %s, capped at /cards' 100", (kind, placeholder) => {
    render(<DirectoryFilters value={{ ...FILTERS, kind }} onChange={vi.fn()} />);
    const input = screen.getByRole("searchbox", { name: "SEARCH" });
    expect(input).toHaveAttribute("placeholder", placeholder);
    expect(input).toHaveAttribute("maxLength", "100");
  });

  it("clear empties q and keeps every other filter", () => {
    const onChange = vi.fn();
    render(<DirectoryFilters value={{ ...FILTERS, kind: "project", q: "forge" }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onChange).toHaveBeenCalledWith({ ...FILTERS, kind: "project", q: "" });
  });
});

describe("Explore: the /validators filter panel", () => {
  it("names validators and is capped at 100", () => {
    render(<ValidatorFilters value={{ ...FILTERS, kind: "validator" }} onChange={vi.fn()} />);
    const input = screen.getByRole("searchbox", { name: "SEARCH" });
    expect(input).toHaveAttribute("placeholder", "Search validators by moniker or @handle…");
    expect(input).toHaveAttribute("maxLength", "100");
  });
});

describe("Explore: an empty result hands off to the global search", () => {
  type Q = UseInfiniteQueryResult<InfiniteData<CardsListResponse>, BccApiError>;
  const empty = {
    isLoading: false,
    isLoadingError: false,
    isError: false,
    error: null,
    data: { pages: [{ items: [], pagination: { page: 1, per_page: 24, total: 0, total_pages: 0 } }], pageParams: [1] },
    hasNextPage: false,
    isFetchingNextPage: false,
    isFetchNextPageError: false,
    refetch: vi.fn(),
    fetchNextPage: vi.fn(),
  } as unknown as Q;

  it("offers 'Search everywhere' with the active search", () => {
    render(<DirectoryGrid query={empty} searchQuery="atom" />);
    expect(screen.getByText("Filter’s too tight.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Search everywhere for “atom”/ })).toHaveAttribute(
      "href",
      "/search?q=atom",
    );
  });

  it("offers nothing extra when there is no search", () => {
    render(<DirectoryGrid query={empty} />);
    expect(screen.queryByRole("link", { name: /Search everywhere/ })).toBeNull();
  });
});
