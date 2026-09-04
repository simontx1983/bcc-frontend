/**
 * Watchers / Watching against a REAL QueryClient.
 *
 * The sibling suite (`accumulator-load-failure.test.tsx`) mocks the hooks and
 * hands the panel fixed result objects. That is the right tool for asserting
 * which retry callback fires, but it cannot answer the questions the
 * regrouping actually raises, because a mocked hook never runs a query:
 *
 *   • does only the SELECTED direction fetch, now that the two are separate
 *     routes rather than two sub-tabs of one mounted panel?
 *   • do the two directions keep separate cache entries and separate
 *     pagination offsets?
 *   • can rows accumulated in one direction leak into the other?
 *
 * So this file mocks the API BOUNDARY — the two endpoint functions — and lets
 * React Query, the hooks, the accumulator and the panel all run for real.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  followers: [] as number[],
  following: [] as number[],
}));

// The real endpoints module reads the runtime env at import time, and
// `importOriginal` below pulls it in for the exports this file does not stub.
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

vi.mock("@/lib/api/user-activity-endpoints", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getUserFollowers: async (p: { offset?: number }) => {
      const offset = p.offset ?? 0;
      calls.followers.push(offset);
      return page("IN", offset);
    },
    getUserFollowing: async (p: { offset?: number }) => {
      const offset = p.offset ?? 0;
      calls.following.push(offset);
      return page("OUT", offset);
    },
  };
});

vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/cards/CardGrid", () => ({
  CardGrid: ({ cards }: { cards: unknown[] }) => <div data-testid="grid">{cards.length}</div>,
}));

const { WatchingPanel } = await import("@/components/profile/panels/WatchingPanel");

/** Two rows per page, named by direction so a leak is unmistakable. */
function page(tag: string, offset: number) {
  const mk = (n: number) => ({
    id: offset * 100 + n,
    kind: "user",
    name: `${tag}-${offset}-${n}`,
    handle: `${tag.toLowerCase()}${offset}${n}`,
    rank_label: "OPERATOR",
    reputation_tier: "solid",
    crest: { image_url: null },
  });
  return {
    items: [mk(1), mk(2)],
    pagination: { offset, limit: 24, total: 6, has_more: offset < 2 },
  };
}

function mount(direction: "followers" | "following") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return render(
    <QueryClientProvider client={client}>
      <WatchingPanel handle="ada" displayName="Ada" direction={direction} />
    </QueryClientProvider>,
  );
}

const rowNames = () =>
  screen.queryAllByRole("listitem").map((li) => li.textContent ?? "");

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  window.localStorage.clear();
  calls.followers = [];
  calls.following = [];
});
afterEach(cleanup);

describe("only the selected direction queries", () => {
  it("Watchers fetches followers and NEVER following", async () => {
    mount("followers");
    await waitFor(() => expect(rowNames().length).toBe(2));
    expect(calls.followers).toEqual([0]);
    expect(calls.following, "the inactive direction fired a request").toEqual([]);
    expect(rowNames()[0]).toContain("IN-0-1");
  });

  it("Watching fetches following and NEVER followers", async () => {
    mount("following");
    await waitFor(() => expect(rowNames().length).toBe(2));
    expect(calls.following).toEqual([0]);
    expect(calls.followers, "the inactive direction fired a request").toEqual([]);
    expect(rowNames()[0]).toContain("OUT-0-1");
  });

  it("the heading names the direction that is showing", async () => {
    mount("followers");
    await waitFor(() => expect(rowNames().length).toBe(2));
    expect(screen.getByRole("heading", { name: "Watchers" })).toBeInTheDocument();
    cleanup();
    mount("following");
    await waitFor(() => expect(rowNames().length).toBe(2));
    expect(screen.getByRole("heading", { name: "Watching" })).toBeInTheDocument();
  });

  it("neither direction renders a destination tablist any more", async () => {
    mount("followers");
    await waitFor(() => expect(rowNames().length).toBe(2));
    expect(screen.queryAllByRole("tablist")).toHaveLength(0);
    expect(screen.queryByRole("tablist", { name: "Watching sections" })).toBeNull();
  });
});

describe("pagination is per-direction", () => {
  it("Load More advances only this direction's offset and appends once", async () => {
    mount("followers");
    await waitFor(() => expect(rowNames().length).toBe(2));

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => expect(rowNames().length).toBe(4));

    expect(calls.followers).toEqual([0, 2]);
    expect(calls.following).toEqual([]);
    // Appended, not duplicated.
    expect(new Set(rowNames()).size).toBe(4);
    expect(rowNames().filter((r) => r.includes("IN-0-1"))).toHaveLength(1);
  });

  it("a fresh mount of the OTHER direction starts at offset 0 with no borrowed rows", async () => {
    mount("followers");
    await waitFor(() => expect(rowNames().length).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => expect(rowNames().length).toBe(4));
    cleanup();

    mount("following");
    await waitFor(() => expect(rowNames().length).toBe(2));
    expect(calls.following).toEqual([0]);
    for (const r of rowNames()) {
      expect(r, "a followers row leaked into following").not.toContain("IN-");
    }
  });
});

describe("profile identity", () => {
  it("a different handle fetches afresh and shows no rows from the previous profile", async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
    });
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <WatchingPanel handle="ada" displayName="Ada" direction="followers" />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(rowNames().length).toBe(2));
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));
    await waitFor(() => expect(rowNames().length).toBe(4));

    rerender(
      <QueryClientProvider client={client}>
        <WatchingPanel handle="bo" displayName="Bo" direction="followers" />
      </QueryClientProvider>,
    );

    // The accumulator must not carry Ada's four rows onto Bo's profile.
    await waitFor(() => expect(rowNames().length).toBe(2));
    expect(rowNames().every((r) => r.includes("-0-"))).toBe(true);
  });
});

describe("the list/grid preference is a MODE, not a destination", () => {
  it("it is a button group, never a tab, and it survives a direction change", async () => {
    mount("followers");
    await waitFor(() => expect(rowNames().length).toBe(2));

    const toggle = screen.getByRole("group", { name: "Roster view" });
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    fireEvent.click(within(toggle).getByRole("button", { name: "GRID" }));
    await waitFor(() => expect(screen.getByTestId("grid")).toBeInTheDocument());

    cleanup();
    mount("following");
    await waitFor(() => expect(screen.getByTestId("grid")).toBeInTheDocument());
  });
});
