/**
 * A chainless ("GENERAL") Hall in the cold-start Discover panel. The
 * backend sends `chain_slug: null` for one (FeedColdStartService::
 * composeHalls), and the no-home-chain cold start takes the first Halls
 * by title, so one can reach the panel on today's prod. The card used to
 * call `chain_slug.toUpperCase()` unguarded and crash; now it reads
 * "GENERAL" (as Communities ▸ Halls does) with a plain border.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));

let data: unknown = undefined;
vi.mock("@/hooks/useColdStart", () => ({
  COLD_START_QUERY_KEY: ["feed", "cold-start"],
  useColdStart: () => ({ isLoading: false, isError: false, data, refetch: vi.fn() }),
}));
vi.mock("@/components/feed/FeedItemCard", () => ({ FeedItemCard: () => <div data-testid="feed-item" /> }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => <div />, isPeepSoPlaceholder: () => false }));
vi.mock("@/components/profile/RankChip", () => ({ RankChip: () => <div /> }));

const { DiscoverPanel } = await import("@/components/feed/DiscoverPanel");

const hallsResponse = (halls: unknown[]) => ({ halls, recent_operators: [], hot_posts: [] });
const textOf = (name: string) => screen.getByText(name).closest("a")?.textContent?.replace(/\s+/g, " ") ?? "";

afterEach(cleanup);

describe("a chainless Hall in Discover", () => {
  it("renders, labelled GENERAL, with a plain border, beside a chained Hall", () => {
    data = hallsResponse([
      { slug: "builders-hall", name: "Builders Hall", chain_slug: null, member_count: 3 },
      { slug: "cosmos-hall", name: "Cosmos Hall", chain_slug: "cosmos", member_count: 1 },
    ]);
    render(<DiscoverPanel enabled />);

    expect(textOf("Builders Hall")).toContain("GENERAL · 3 members");
    const general = screen.getByText("Builders Hall").closest("a") as HTMLAnchorElement;
    expect(general.style.borderLeft).toBe("3px solid var(--bcc-border)");
    expect(general.getAttribute("style")).not.toContain("chain-null");

    expect(textOf("Cosmos Hall")).toContain("COSMOS · 1 member");
    const cosmos = screen.getByText("Cosmos Hall").closest("a") as HTMLAnchorElement;
    expect(cosmos.getAttribute("style")).toContain("var(--chain-cosmos, var(--bcc-border))");
  });

  it("an absent or blank chain_slug reads the same way", () => {
    data = hallsResponse([
      { slug: "a-hall", name: "A Hall", member_count: 2 },
      { slug: "b-hall", name: "B Hall", chain_slug: "  ", member_count: 2 },
    ]);
    render(<DiscoverPanel enabled />);
    expect(textOf("A Hall")).toContain("GENERAL · 2 members");
    expect(textOf("B Hall")).toContain("GENERAL · 2 members");
  });
});
