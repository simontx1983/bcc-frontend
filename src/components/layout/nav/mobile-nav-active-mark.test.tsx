/**
 * The mobile bar's active item carries a NON-COLOUR cue (#74).
 *
 * After the chrome contrast pass, active vs inactive differed only by
 * text brightness (--bcc-text vs --bcc-text-secondary). That is a
 * colour-only signal, so the active item now also gets a 3px top bar on
 * --bcc-accent-indicator and `aria-current="page"`. Exactly one item is
 * marked, and no item is marked on a route the bar doesn't list.
 *
 * Site Structure A: the bar is Home · Explore · ＋ · Communities · Menu
 * signed in, and Home · Explore · Members · Communities · Menu for a guest
 * (nav-items phoneBarFor). Halls left the bar for Explore.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
const session = vi.hoisted(() => ({ data: { user: { handle: "anvil" } } as unknown }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: session.data, status: session.data ? "authenticated" : "unauthenticated" }),
}));
vi.mock("@/components/composer/NewPostTrigger", () => ({
  NewPostTrigger: ({ ariaLabel }: { ariaLabel: string }) => <button type="button" aria-label={ariaLabel} />,
}));

import { MobileNav } from "@/components/layout/nav/MobileNav";

afterEach(() => {
  cleanup();
  session.data = { user: { handle: "anvil" } };
});

function show(path: string, signedIn = true) {
  pathname = path;
  session.data = signedIn ? { user: { handle: "anvil" } } : null;
  render(<MobileNav onMenuOpen={() => undefined} />);
}

const link = (name: string) => screen.getByRole("link", { name });

const SIGNED_IN_LINKS = ["Home", "Explore", "Communities"];
const GUEST_LINKS = ["Home", "Explore", "Members", "Communities"];

describe("MobileNav active item", () => {
  it.each([
    ["/", "Home", true],
    ["/explore", "Explore", true],
    ["/explore/projects", "Explore", true],
    ["/communities/abc", "Communities", true],
    ["/members", "Members", false],
    ["/members/mentors", "Members", false],
  ] as const)("on %s marks %s, and only it", (path, label, signedIn) => {
    show(path, signedIn);

    const marks = screen.getAllByTestId("mobile-nav-active-mark");
    expect(marks).toHaveLength(1);
    expect(link(label)).toContainElement(marks[0] as HTMLElement);
    expect(marks[0]).toHaveAttribute("aria-hidden", "true");
    expect((marks[0] as HTMLElement).style.background).toBe("var(--bcc-accent-indicator)");

    for (const other of signedIn ? SIGNED_IN_LINKS : GUEST_LINKS) {
      if (other === label) expect(link(other)).toHaveAttribute("aria-current", "page");
      else expect(link(other)).not.toHaveAttribute("aria-current");
    }
  });

  it("marks nothing on /halls, which left the bar (Halls is in Communities now)", () => {
    show("/halls");
    expect(screen.queryByTestId("mobile-nav-active-mark")).toBeNull();
    for (const name of SIGNED_IN_LINKS) {
      expect(link(name)).not.toHaveAttribute("aria-current");
    }
    expect(screen.queryByRole("link", { name: "Halls" })).toBeNull();
  });

  it("marks nothing on /members for a member: Members is in the Menu, not the bar", () => {
    show("/members");
    expect(screen.queryByTestId("mobile-nav-active-mark")).toBeNull();
    expect(screen.queryByRole("link", { name: "Members" })).toBeNull();
  });

  it("marks nothing on a route the bar does not list", () => {
    show("/settings");
    expect(screen.queryByTestId("mobile-nav-active-mark")).toBeNull();
    for (const name of SIGNED_IN_LINKS) {
      expect(link(name)).not.toHaveAttribute("aria-current");
    }
  });
});
