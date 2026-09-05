/**
 * DiscoverPanel — a failed request is not a confirmed empty floor.
 *
 * This panel is what a brand-new account sees immediately after
 * onboarding, because their feed is empty. It rendered the SAME
 * "Quiet on the Floor" copy for three different situations: still
 * loading, loaded-and-genuinely-empty, and the request failed. On a
 * cold-start platform that collapses the difference between "you're
 * early" and "we're broken", and states the former as fact.
 *
 * Loading keeps its deliberate quiet treatment — that part was a
 * considered choice and is preserved.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

interface ColdStartState {
  isLoading: boolean;
  isError: boolean;
  data: unknown;
}
let state: ColdStartState = { isLoading: false, isError: false, data: undefined };
const refetch = vi.fn();

vi.mock("@/hooks/useColdStart", () => ({
  COLD_START_QUERY_KEY: ["feed", "cold-start"],
  useColdStart: () => ({ ...state, refetch }),
}));

// Leaf renderers the panel composes — irrelevant to the failure contract.
vi.mock("@/components/feed/FeedItemCard", () => ({
  FeedItemCard: () => <div data-testid="feed-item" />,
}));
vi.mock("@/components/identity/Avatar", () => ({
  Avatar: () => <div />,
  isPeepSoPlaceholder: () => false,
}));
vi.mock("@/components/profile/RankChip", () => ({ RankChip: () => <div /> }));

const { DiscoverPanel } = await import("@/components/feed/DiscoverPanel");

const has = (re: RegExp) =>
  screen.queryByText((c) => re.test(c.replace(/\s+/g, " "))) !== null;

const EMPTY = { halls: [], recent_operators: [], hot_posts: [] };
const POPULATED = {
  halls: [{ slug: "cosmos-hall", name: "Cosmos Hall", chain_slug: "cosmos", member_count: 3 }],
  recent_operators: [],
  hot_posts: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  state = { isLoading: false, isError: false, data: undefined };
});

afterEach(cleanup);

describe("loading", () => {
  it("keeps the quiet panel, with no error and no retry", () => {
    state = { isLoading: true, isError: false, data: undefined };
    render(<DiscoverPanel enabled />);
    expect(has(/quiet on the floor/i)).toBe(true);
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });
});

describe("a confirmed empty response", () => {
  it("still shows the civic terminal copy — this state was never a bug", () => {
    state = { isLoading: false, isError: false, data: EMPTY };
    render(<DiscoverPanel enabled />);
    expect(has(/just opening up/i)).toBe(true);
    expect(screen.queryByRole("button", { name: /retry/i })).toBeNull();
  });
});

describe("a FAILED request", () => {
  beforeEach(() => {
    state = { isLoading: false, isError: true, data: undefined };
  });

  it("says the load failed instead of asserting the floor is quiet", () => {
    render(<DiscoverPanel enabled />);
    expect(has(/couldn.t load/i)).toBe(true);
    // The regression: claiming emptiness we never verified.
    expect(has(/quiet on the floor/i)).toBe(false);
    expect(has(/just opening up/i)).toBe(false);
  });

  it("announces the failure", () => {
    render(<DiscoverPanel enabled />);
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
  });

  it("offers a real retry wired to the existing query", () => {
    render(<DiscoverPanel enabled />);
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});

describe("a background refetch that fails after a good load", () => {
  it("keeps the content already on screen rather than discarding it", () => {
    state = { isLoading: false, isError: true, data: POPULATED };
    render(<DiscoverPanel enabled />);
    // React Query hands back the last success alongside isError; throwing
    // it away would be a worse outcome than a slightly stale panel.
    expect(has(/halls you might join/i)).toBe(true);
    expect(has(/cosmos hall/i)).toBe(true);
    expect(has(/couldn.t load/i)).toBe(false);
  });
});

describe("disabled", () => {
  it("renders the quiet panel and never calls the endpoint's retry", () => {
    state = { isLoading: false, isError: false, data: EMPTY };
    render(<DiscoverPanel enabled={false} />);
    expect(has(/quiet on the floor/i)).toBe(true);
    expect(refetch).not.toHaveBeenCalled();
  });
});
