/**
 * PR C1: the public owner-verification badge on the validator page header.
 *
 * Pinned:
 *   - the server's `label` renders VERBATIM (never "Verified", never text
 *     derived from `kind`), and opening it shows `label` + `description`;
 *   - the toggle is a 44px tap target;
 *   - a missing, null or blank label renders no badge at all (fail closed);
 *   - nothing date-like reaches the DOM even when the wire carries one.
 *
 * Search rows don't carry the field (bcc-search doesn't serve it), so they
 * keep today's VerifiedBadge and aren't tested here.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { OwnerVerificationBadge } from "@/components/ui/OwnerVerificationBadge";

afterEach(cleanup);

const NODE_KEY = {
  kind: "node_key",
  label: "Node Key Verified",
  description: "Cryptographic proof",
};
const STAFF = { kind: "staff", label: "Verified by BCC", description: "Staff verification" };

/** Anything that looks like a date or a time of day. */
const DATE_LIKE = /\b20\d\d\b|\b\d{1,2}:\d{2}\b|\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/;

describe("OwnerVerificationBadge (page header)", () => {
  it("renders the server label verbatim and opens to label + description", () => {
    const { container } = render(<OwnerVerificationBadge verification={NODE_KEY} />);
    const badge = screen.getByTestId("owner-verification");
    const summary = within(badge).getByText("Node Key Verified", { selector: "summary" });
    expect(summary).toBeInTheDocument();
    // The toggle is an interactive control: a 44px tap target (HIT_AREA_44's
    // h-11 hit area) around the 36px chip.
    expect(summary.className).toContain("before:h-11");
    expect(summary.className).toContain("before:w-[max(100%,2.75rem)]");
    expect(badge).not.toHaveAttribute("open");

    fireEvent.click(summary);
    expect(badge).toHaveAttribute("open");
    // The panel repeats the label and adds the description, both verbatim.
    expect(within(badge).getAllByText("Node Key Verified")).toHaveLength(2);
    expect(within(badge).getByText("Cryptographic proof")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\bVerified Operator\b/);
  });

  it("never renders text derived from kind", () => {
    // A server label the kind would never produce: only the label may show.
    const { container } = render(
      <OwnerVerificationBadge
        verification={{ kind: "wallet", label: "Proof on file", description: "Signed by the operator" }}
      />,
    );
    expect(container.textContent).toContain("Proof on file");
    expect(container.textContent).not.toMatch(/wallet/i);
    expect(container.textContent).not.toMatch(/node key|staff/i);
  });

  it("renders no date even when the wire carries verified_at and method", () => {
    const { container } = render(
      <OwnerVerificationBadge
        verification={{ ...STAFF, method: "staff", verified_at: "2026-11-01T09:15:00Z" }}
      />,
    );
    fireEvent.click(screen.getByText("Verified by BCC", { selector: "summary" }));
    expect(container.textContent).not.toMatch(DATE_LIKE);
    expect(container.textContent).not.toContain("2026-11-01");
  });

  it.each([
    ["absent", undefined],
    ["null", null],
    ["a blank label", { kind: "wallet", label: "   ", description: "Cryptographic proof" }],
    ["an empty label", { kind: "wallet", label: "", description: "Cryptographic proof" }],
    ["no label key", { kind: "wallet", description: "Cryptographic proof" }],
    ["a non-string label", { kind: "wallet", label: 7, description: "Cryptographic proof" }],
  ])("renders nothing for %s", (_name, value) => {
    const { container } = render(<OwnerVerificationBadge verification={value} />);
    expect(container).toBeEmptyDOMElement();
  });
});
