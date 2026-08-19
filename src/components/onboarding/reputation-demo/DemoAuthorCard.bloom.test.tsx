/**
 * Runtime companion to `src/app/rep-demo-bloom-layering.test.ts`.
 *
 * That file reads the source text; this one renders the component and
 * asserts the RENDERED tree, because the property that matters is a
 * paint-order property: a positioned decoration that comes after the
 * button in document order paints over it. Source order and DOM order
 * can diverge (conditional branches, fragments, portals), so the
 * invariant is checked where it actually applies.
 *
 * What is NOT checkable here: jsdom has no layout or compositing, so it
 * cannot tell you what the bloom looks like. That is why the fix is
 * geometric — a border ring rather than a fill — and why the contrast
 * arithmetic lives next door.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DemoAuthorCard } from "@/components/onboarding/reputation-demo/DemoAuthorCard";
import { REPUTATION_DEMO_COMBOS } from "@/components/onboarding/reputation-demo/combos";

// Module-load requirement only: the card's subtree reaches lib/env, which
// reads NEXT_PUBLIC_BCC_API_URL at import time. Same shim as
// HallChainProfile.test.tsx.
vi.mock("@/lib/env", () => ({
  clientEnv: { BCC_API_URL: "https://wp.example" },
}));

// next/image can't render under vitest (its dev loader validates the src
// against next.config's images config, which vitest doesn't load).
vi.mock("next/image", () => ({
  __esModule: true,
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element -- test double for next/image
    <img data-testid="next-image-mock" src={src} alt={alt} />
  ),
}));

afterEach(cleanup);

const COMBO = REPUTATION_DEMO_COMBOS[0];

function vouch(): HTMLElement {
  const button = screen.getByRole("button", { name: /vouch/i });
  fireEvent.click(button);
  return button;
}

describe("the demo Vouch burst renders behind the button", () => {
  it("has a combo fixture to render", () => {
    expect(COMBO).toBeDefined();
    expect(REPUTATION_DEMO_COMBOS.length).toBeGreaterThan(0);
  });

  it("no burst before the first click", () => {
    const { container } = render(<DemoAuthorCard combo={COMBO!} reducedMotion={false} />);
    expect(container.querySelector(".bcc-rep-demo-bloom")).toBeNull();
  });

  it("the ring precedes the button in document order, and the button is positioned", () => {
    const { container } = render(<DemoAuthorCard combo={COMBO!} reducedMotion={false} />);
    const button = vouch();

    const bloom = container.querySelector(".bcc-rep-demo-bloom");
    expect(bloom, "no burst element rendered after the click").not.toBeNull();

    // DOCUMENT_POSITION_FOLLOWING (4) — the button comes after the bloom, so
    // the button paints last among these positioned siblings.
    const position = bloom!.compareDocumentPosition(button);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // …and it is positioned, so it participates in that ordering at all.
    expect(button.className).toMatch(/\brelative\b/);
    expect(button.className).toMatch(/\bbcc-btn-vouch-on\b/);
  });

  it("the burst is hidden from assistive tech and announces nothing", () => {
    const { container } = render(<DemoAuthorCard combo={COMBO!} reducedMotion={false} />);
    vouch();
    const bloom = container.querySelector(".bcc-rep-demo-bloom");
    expect(bloom!.getAttribute("aria-hidden")).toBe("true");
    expect(bloom!.textContent).toBe("");
  });

  it("the label is a child of the button, never of the decoration", () => {
    // The whole defect was the label ending up under the decoration. If the
    // text ever moves into that layer, this is where it shows up.
    const { container } = render(<DemoAuthorCard combo={COMBO!} reducedMotion={false} />);
    const button = vouch();
    expect(button.textContent).toBe("Vouched");
    expect(container.querySelector(".bcc-rep-demo-bloom")!.children.length).toBe(0);
  });

  it("reduced motion renders no animated class at all", () => {
    const { container } = render(<DemoAuthorCard combo={COMBO!} reducedMotion />);
    vouch();
    expect(container.querySelector(".bcc-rep-demo-bloom")).toBeNull();
    expect(container.querySelector(".bcc-rep-demo-vouch-sparkle")).toBeNull();
  });

  it("un-vouching stays silent — the burst is an OFF→ON signal", () => {
    const { container } = render(<DemoAuthorCard combo={COMBO!} reducedMotion={false} />);
    vouch();
    expect(container.querySelector(".bcc-rep-demo-bloom")).not.toBeNull();
    // Toggling back leaves the (spent) burst node alone rather than firing a
    // second one; what matters is that no NEW key is minted.
    const first = container.querySelector(".bcc-rep-demo-bloom");
    fireEvent.click(screen.getByRole("button", { name: /vouch/i }));
    expect(container.querySelector(".bcc-rep-demo-bloom")).toBe(first);
  });
});
