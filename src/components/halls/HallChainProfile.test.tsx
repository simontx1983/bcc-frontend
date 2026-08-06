import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { HallChainProfile } from "@/components/halls/HallChainProfile";
import type { ChainProfile } from "@/lib/api/types";

// Module-load requirement only: the mixed-host icon gate imports
// lib/media → lib/env, which reads NEXT_PUBLIC_BCC_API_URL at import.
// The mocked host deliberately differs from the WP hosts asserted below.
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

// next/image can't render in vitest: its dev loader validates the src
// host against next.config's images config, which vitest doesn't load,
// so any WP-hosted src throws. The mock renders a plain img tagged with
// a marker so the tests can assert WHICH branch of the mixed-host gate
// ran, which is the thing under test.
vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test double for next/image
    <img data-testid="next-image-mock" src={src} alt={alt} />
  ),
}));

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

  it("treats an empty icon_url as no icon (monogram, no <img>)", () => {
    const { container } = render(
      <HallChainProfile chainProfile={{ ...base, icon_url: "" }} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("C")).toBeDefined();
  });

  it("routes a WP-hosted icon through next/image", () => {
    const wpIcon = "https://bluecollarcrypto.io/wp-content/uploads/chains/cosmos.png";
    render(<HallChainProfile chainProfile={{ ...base, icon_url: wpIcon }} />);
    const img = screen.getByTestId("next-image-mock");
    expect(img.getAttribute("src")).toBe(wpIcon);
  });

  it("keeps a non-WP icon on a raw <img> (outside the next/image allowlist)", () => {
    const cdnIcon = "https://ipfs.io/ipfs/QmExample/cosmos.png";
    const { container } = render(
      <HallChainProfile chainProfile={{ ...base, icon_url: cdnIcon }} />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    // The mixed-host gate must NOT hand this to next/image — an
    // un-allowlisted host 400s at /_next/image. The raw URL passes
    // through untouched, and the next/image mock marker is absent.
    expect(img?.getAttribute("src")).toBe(cdnIcon);
    expect(img?.getAttribute("data-testid")).toBeNull();
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
