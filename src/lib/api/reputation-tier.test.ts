/**
 * The top trust band is `elite`, labelled "Elite" (bcc-trust
 * `ReputationTierMap::TIER_LABEL`, an owner decision; "Proven" was
 * rejected). A frontend-only `proven` key lingered for a rename the server
 * never shipped. These keep it from coming back.
 */

import { describe, expect, it } from "vitest";

import type { ReputationTier } from "@/lib/api/types";

describe("ReputationTier", () => {
  it("has the server's five keys and no `proven`", () => {
    const tiers: ReputationTier[] = ["elite", "trusted", "neutral", "caution", "risky"];
    // @ts-expect-error — "proven" is not a tier; the server's top band is `elite`.
    // If `proven` is ever re-added to the union, this line stops being an
    // error and `tsc --noEmit` fails on the unused directive.
    const notATier: ReputationTier = "proven";
    expect(tiers).not.toContain(notATier);
  });
});
