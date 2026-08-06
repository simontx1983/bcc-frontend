import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { HallChainProfile } from "@/components/halls/HallChainProfile";
import type { ChainProfile } from "@/lib/api/types";

/**
 * Pins the additive contract-v1.73 chain-identity hero:
 *   - absent / null chain_profile renders nothing (old-backend + chainless
 *     Halls must look exactly like before),
 *   - each content field is independently optional,
 *   - the operator `color` and `explorer_url` are never trusted blindly.
 *
 * `color` is deliberately null in the base fixture (jsdom normalises inline hex
 * to rgb(), so asserting a valid hex is brittle) — the security-relevant path
 * is that an UNSAFE value never reaches the markup, which is asserted directly.
 */
const base: ChainProfile = {
  slug: "cosmos",
  name: "Cosmos",
  native_token: "ATOM",
  chain_type: "cosmos",
  explorer_url: "https://www.mintscan.io/cosmos",
  icon_url: null,
  color: null,
  description: "The internet of blockchains.",
};

describe("HallChainProfile", () => {
  // Vitest runs without global test APIs, so RTL's auto-cleanup doesn't fire.
  afterEach(() => {
    cleanup();
  });

  it("renders nothing when chain_profile is null (chainless Hall)", () => {
    const { container } = render(<HallChainProfile chainProfile={null} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing when chain_profile is undefined (old backend)", () => {
    const { container } = render(<HallChainProfile chainProfile={undefined} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders identity facts with an uppercased chain-type label", () => {
    render(<HallChainProfile chainProfile={base} />);
    expect(screen.getByText("Cosmos")).toBeDefined();
    expect(screen.getByText("COSMOS")).toBeDefined();
    expect(screen.getByText("ATOM")).toBeDefined();
  });

  it("renders the explorer as a safe external link", () => {
    render(<HallChainProfile chainProfile={base} />);
    const link = screen.getByRole("link", { name: /block explorer/i });
    expect(link.getAttribute("href")).toBe("https://www.mintscan.io/cosmos");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("omits the explorer link when explorer_url is null", () => {
    render(<HallChainProfile chainProfile={{ ...base, explorer_url: null }} />);
    expect(
      screen.queryByRole("link", { name: /block explorer/i }),
    ).toBeNull();
  });

  it("rejects a non-http explorer_url", () => {
    render(
      <HallChainProfile
        chainProfile={{ ...base, explorer_url: "javascript:alert(1)" }}
      />,
    );
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows the About section only when description is non-empty", () => {
    const { rerender } = render(<HallChainProfile chainProfile={base} />);
    expect(screen.getByText("ABOUT THIS CHAIN")).toBeDefined();
    expect(screen.getByText("The internet of blockchains.")).toBeDefined();

    rerender(<HallChainProfile chainProfile={{ ...base, description: "   " }} />);
    expect(screen.queryByText("ABOUT THIS CHAIN")).toBeNull();
  });

  it("falls back to a monogram (never a broken image) when icon_url is null", () => {
    const { container } = render(<HallChainProfile chainProfile={base} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("C")).toBeDefined();
  });

  it("never injects an unsafe color value into the markup", () => {
    const { container } = render(
      <HallChainProfile
        chainProfile={{ ...base, color: "expression(alert(1))" }}
      />,
    );
    expect(container.innerHTML).not.toContain("expression");
  });
});
