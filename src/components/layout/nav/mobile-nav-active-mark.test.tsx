/**
 * The mobile bar's active item carries a NON-COLOUR cue (#74).
 *
 * After the chrome contrast pass, active vs inactive differed only by
 * text brightness (--bcc-text vs --bcc-text-secondary). That is a
 * colour-only signal, so the active item now also gets a 3px top bar on
 * --bcc-accent-indicator and `aria-current="page"`. Exactly one item is
 * marked, and no item is marked on a route the bar doesn't list.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("@/components/composer/NewPostTrigger", () => ({
  NewPostTrigger: ({ ariaLabel }: { ariaLabel: string }) => <button type="button" aria-label={ariaLabel} />,
}));

import { MobileNav } from "@/components/layout/nav/MobileNav";

afterEach(() => {
  cleanup();
});

function show(path: string) {
  pathname = path;
  render(<MobileNav onMenuOpen={() => undefined} />);
}

const link = (name: string) => screen.getByRole("link", { name });

describe("MobileNav active item", () => {
  it.each([
    ["/", "Home"],
    ["/directory", "Directory"],
    ["/communities/abc", "Communities"],
  ])("on %s marks %s, and only it", (path, label) => {
    show(path);

    const marks = screen.getAllByTestId("mobile-nav-active-mark");
    expect(marks).toHaveLength(1);
    expect(link(label)).toContainElement(marks[0] as HTMLElement);
    expect(marks[0]).toHaveAttribute("aria-hidden", "true");
    expect((marks[0] as HTMLElement).style.background).toBe("var(--bcc-accent-indicator)");

    for (const other of ["Home", "Directory", "Communities"]) {
      if (other === label) expect(link(other)).toHaveAttribute("aria-current", "page");
      else expect(link(other)).not.toHaveAttribute("aria-current");
    }
  });

  it("marks nothing on a route the bar does not list", () => {
    show("/settings");
    expect(screen.queryByTestId("mobile-nav-active-mark")).toBeNull();
    for (const name of ["Home", "Directory", "Communities"]) {
      expect(link(name)).not.toHaveAttribute("aria-current");
    }
  });
});
