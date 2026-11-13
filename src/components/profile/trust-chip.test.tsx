import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReputationTier } from "@/lib/api/types";

// RankInfoModal pulls the API client in; the chip only needs it on click.
vi.mock("@/components/identity/RankInfoModal", () => ({ RankInfoModal: () => null }));

import { TrustChip } from "./RankChip";

afterEach(cleanup);

/** The visible (non-sr-only) words of the chip, in order. */
function visibleText(container: HTMLElement): string {
  return Array.from(container.querySelectorAll("[aria-hidden]"))
    .map((el) => el.textContent ?? "")
    .filter((t) => t !== "")
    .join(" ");
}

describe("TrustChip", () => {
  it("renders the tier word and the score: TRUSTED 72", () => {
    const { container } = render(
      <TrustChip reputationTier="trusted" tierLabel="Trusted" score={72} />,
    );
    expect(visibleText(container)).toBe("TRUSTED 72");
    expect(screen.getByTestId("trust-chip-dot")).toBeInTheDocument();
  });

  it("degrades to the tier word alone when the score is undefined", () => {
    const { container } = render(<TrustChip reputationTier="trusted" tierLabel="Trusted" />);
    expect(visibleText(container)).toBe("TRUSTED");
    expect(container.textContent).not.toMatch(/\d/);
  });

  it("an unknown tier renders no dot and no tint", () => {
    const { container } = render(
      <TrustChip
        reputationTier={"mythic" as ReputationTier}
        tierLabel="Mythic"
        score={10}
      />,
    );
    expect(screen.queryByTestId("trust-chip-dot")).toBeNull();
    const chip = container.firstElementChild as HTMLElement;
    expect(chip.className).toContain("bcc-rank-chip-untiered");
    expect(chip.getAttribute("style") ?? "").not.toContain("--chip-tier");
    expect(visibleText(container)).toBe("MYTHIC 10");
  });

  it("colours the mark, not the word", () => {
    const { container } = render(
      <TrustChip reputationTier="risky" tierLabel="Risky" score={4} />,
    );
    const chip = container.firstElementChild as HTMLElement;
    // The hue rides on the chip's --chip-tier (border/fill) and the dot.
    expect(chip.getAttribute("style")).toContain("--bcc-trust-risky");
    expect(screen.getByTestId("trust-chip-dot").getAttribute("style")).toContain("--bcc-trust-risky");
    // The words carry no colour of their own.
    for (const el of Array.from(container.querySelectorAll("span[aria-hidden]"))) {
      if (el.getAttribute("data-testid") === "trust-chip-dot") continue;
      expect(el.getAttribute("style") ?? "").not.toContain("color");
      expect(el.className).not.toMatch(/text-(bcc-trust|verified|bcc-text-safety)/);
    }
  });

  it("renders for a member with no rank (it does not depend on rank)", () => {
    const { container } = render(<TrustChip reputationTier="neutral" tierLabel="Neutral" />);
    expect(visibleText(container)).toBe("NEUTRAL");
  });

  it("becomes the Rank & Trust button when a handle is given", () => {
    render(<TrustChip reputationTier="trusted" tierLabel="Trusted" handle="alice" />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-haspopup", "dialog");
  });
});
