import { describe, expect, it, vi } from "vitest";

import { QUERY_ROOTS_TO_INVALIDATE } from "@/hooks/useAttestations";
import { DIRECTORY_QUERY_KEY_ROOT } from "@/hooks/useDirectory";
import { MEMBERS_QUERY_KEY_ROOT } from "@/hooks/useMembers";
import { WATCHING_QUERY_KEY_ROOT } from "@/hooks/useWatching";

/**
 * Regression pin for the vouch-invalidation gap (2026-08-06): the
 * attestation mutations invalidated ["card"]/["cards-list"]/["member"]/
 * ["user-profile"]/["attestation-roster"], but the card-bearing grids
 * actually cache under ["directory"] (/directory + /validators),
 * ["members"] (/members) and ["watching"] (watchlist + CardActionBar's
 * watch fallback) — so a vouch cast from any of those surfaces never
 * flipped the pill until an unrelated refetch.
 *
 * The assertion goes through the SAME exported root constants the hooks
 * key their queries with, so renaming a root without updating the
 * invalidation list fails here rather than in production.
 */

// Transitive module-load requirements only (the typed API client reads
// clientEnv at import; useWatching imports next-auth/react). Nothing in
// this test executes either.
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: "unauthenticated", data: null }),
  getSession: async () => null,
}));

describe("QUERY_ROOTS_TO_INVALIDATE", () => {
  const roots = QUERY_ROOTS_TO_INVALIDATE.map((root) => JSON.stringify(root));

  const expectCovers = (root: readonly string[]) => {
    expect(roots).toContain(JSON.stringify(root));
  };

  it("covers the /directory + /validators grids (useDirectory)", () => {
    expectCovers(DIRECTORY_QUERY_KEY_ROOT);
  });

  it("covers the /members grid (useMembers)", () => {
    expectCovers(MEMBERS_QUERY_KEY_ROOT);
  });

  it("covers the watching namespace (useWatching — watchlist + card fallback)", () => {
    expectCovers(WATCHING_QUERY_KEY_ROOT);
  });

  it("still covers the original entity/profile namespaces", () => {
    expectCovers(["card"]);
    expectCovers(["cards-list"]);
    expectCovers(["member"]);
    expectCovers(["user-profile"]);
    expectCovers(["attestation-roster"]);
  });
});
