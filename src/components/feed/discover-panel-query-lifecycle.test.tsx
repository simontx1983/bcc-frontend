/**
 * DiscoverPanel driven through the REAL React Query lifecycle.
 *
 * The sibling file (discover-panel-failure.test.tsx) mocks `useColdStart`
 * and asserts the panel's branches directly. That proves the rendering
 * contract but not the wiring — it cannot catch a wrong query key, a retry
 * that never reaches the fetcher, or `isError` arriving alongside retained
 * data in a shape the panel mishandles.
 *
 * So here only the ENDPOINT is mocked. A fresh QueryClient per test (retry
 * off, no cache shared between tests) drives loading → error → retry →
 * success for real.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

const getColdStart = vi.fn();
vi.mock("@/lib/api/cold-start-endpoints", () => ({
  getColdStart: (...a: unknown[]) => getColdStart(...a),
}));

vi.mock("@/components/feed/FeedItemCard", () => ({
  FeedItemCard: () => <div data-testid="feed-item" />,
}));
vi.mock("@/components/identity/Avatar", () => ({
  Avatar: () => <div />,
  isPeepSoPlaceholder: () => false,
}));
vi.mock("@/components/profile/RankChip", () => ({ RankChip: () => <div /> }));

const { DiscoverPanel } = await import("@/components/feed/DiscoverPanel");

const EMPTY = { halls: [], recent_operators: [], hot_posts: [] };
const POPULATED = {
  halls: [{ slug: "cosmos-hall", name: "Cosmos Hall", chain_slug: "cosmos", member_count: 3 }],
  recent_operators: [],
  hot_posts: [],
};

const has = (re: RegExp) =>
  screen.queryByText((c) => re.test(c.replace(/\s+/g, " "))) !== null;

let client: QueryClient;

function renderPanel() {
  return render(
    <QueryClientProvider client={client}>
      <DiscoverPanel enabled />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
});

afterEach(() => {
  cleanup();
  client.clear();
});

describe("the real query lifecycle", () => {
  it("shows the quiet panel while loading, never a failure", async () => {
    let release!: (v: unknown) => void;
    getColdStart.mockReturnValueOnce(new Promise((r) => { release = r; }));
    renderPanel();

    expect(has(/quiet on the floor/i)).toBe(true);
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();

    release(EMPTY);
    await waitFor(() => expect(has(/just opening up/i)).toBe(true));
  });

  it("reaches a truthful failure state when the fetcher rejects", async () => {
    getColdStart.mockRejectedValueOnce(new Error("network"));
    renderPanel();

    await waitFor(() => expect(has(/couldn.t load/i)).toBe(true));
    // A failure must never be presentable as a confirmed empty floor.
    expect(has(/quiet on the floor/i)).toBe(false);
    expect(has(/just opening up/i)).toBe(false);
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("retry re-invokes the real fetcher and renders the content on success", async () => {
    getColdStart.mockRejectedValueOnce(new Error("network"));
    renderPanel();
    await waitFor(() => expect(has(/couldn.t load/i)).toBe(true));
    expect(getColdStart).toHaveBeenCalledTimes(1);

    getColdStart.mockResolvedValueOnce(POPULATED);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => expect(has(/cosmos hall/i)).toBe(true));
    expect(getColdStart).toHaveBeenCalledTimes(2);
    expect(has(/couldn.t load/i)).toBe(false);
    expect(has(/halls you might join/i)).toBe(true);
  });

  it("a background refetch failure keeps the content already on screen", async () => {
    getColdStart.mockResolvedValueOnce(POPULATED);
    renderPanel();
    await waitFor(() => expect(has(/cosmos hall/i)).toBe(true));

    // Invalidate so the panel refetches, and fail that refetch.
    getColdStart.mockRejectedValueOnce(new Error("flaky"));
    await client.invalidateQueries({ queryKey: ["feed", "cold-start"] });

    await waitFor(() => expect(getColdStart).toHaveBeenCalledTimes(2));
    // React Query retains the last success; discarding it would be worse
    // than a slightly stale panel.
    expect(has(/cosmos hall/i)).toBe(true);
    expect(has(/couldn.t load/i)).toBe(false);
  });

  it("uses the documented query key, so invalidation elsewhere reaches it", async () => {
    getColdStart.mockResolvedValueOnce(POPULATED);
    renderPanel();
    await waitFor(() => expect(has(/cosmos hall/i)).toBe(true));
    expect(client.getQueryData(["feed", "cold-start"])).toBeDefined();
  });

  it("changes no Hall ordering — it renders exactly what the server sent", async () => {
    const ordered = {
      ...EMPTY,
      halls: [
        { slug: "b-hall", name: "Bravo Hall", chain_slug: "cosmos", member_count: 99 },
        { slug: "a-hall", name: "Alpha Hall", chain_slug: "osmosis", member_count: 1 },
      ],
    };
    getColdStart.mockResolvedValueOnce(ordered);
    renderPanel();

    await waitFor(() => expect(has(/bravo hall/i)).toBe(true));
    const names = [...document.querySelectorAll("a[href^='/halls/']")].map(
      (a) => a.textContent ?? "",
    );
    // Server order preserved — no client-side ranking by member_count or name.
    expect(names[0]).toContain("Bravo Hall");
    expect(names[1]).toContain("Alpha Hall");
  });
});
