import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ChainTabs } from "@/components/entity/ChainTabs";
import type { CardChain } from "@/lib/api/types";

/**
 * Wallet-privacy regression for the public validator identity strip.
 *
 * Validator rows are keyed to a wallet link, and `ClaimService::matchValidatorWallet`
 * matches the operator address against the CLAIMANT'S VERIFIED WALLET — so on a
 * claimed page the old `operator_address` field bound an on-chain address to a
 * named member, on a page any anonymous visitor can load. It was rendered
 * mid-truncated (`cosmosvaloper1abc…wxyz`), which is a shortened wallet address
 * by another name and is forbidden outright.
 *
 * The server now sends only `operator_verified`. This test pins the rendered
 * output so a future change can't quietly reintroduce an address.
 *
 * See docs/wallet-privacy-policy.md.
 */

const chains: CardChain[] = [
  { slug: "cosmos", name: "Cosmos Hub", operator_verified: true },
  { slug: "osmosis", name: "Osmosis", operator_verified: false },
];

describe("ChainTabs", () => {
  // Vitest runs without global test APIs, so RTL's auto-cleanup doesn't fire.
  afterEach(() => {
    cleanup();
  });

  it("renders one pill per chain with the chain name", () => {
    render(<ChainTabs chains={chains} />);

    expect(screen.getByText("COSMOS HUB")).toBeDefined();
    expect(screen.getByText("OSMOSIS")).toBeDefined();
  });

  it("shows the verified marker only for a verified operator", () => {
    render(<ChainTabs chains={chains} />);

    // One VERIFIED marker — Cosmos has it, Osmosis does not.
    expect(screen.getAllByText("VERIFIED")).toHaveLength(1);
  });

  it("renders no address-shaped text anywhere", () => {
    const { container } = render(<ChainTabs chains={chains} />);
    const text = container.textContent ?? "";

    expect(text).not.toContain("valoper");
    expect(text).not.toContain("0x");
    // A mid-ellipsis is how the old truncated address rendered.
    expect(text).not.toContain("…");
  });

  it("stays hidden for single-chain operators", () => {
    const { container } = render(
      <ChainTabs chains={[chains[0] as CardChain]} />,
    );

    expect(container.textContent).toBe("");
  });
});
