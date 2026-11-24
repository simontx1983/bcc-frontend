/**
 * Site Structure A, PR 3: the navigation.
 *
 *   1. Desktop sidebar: Home · Explore (pages) · Members (people) ·
 *      Communities (groups), a dashed rule, then Messages · Watching
 *      (your list) for a member. A guest gets the four sections and the
 *      way in (Join the Floor, Sign in), and no New Post.
 *   2. Phone bar: Home · Explore · ＋ · Communities · Menu signed in;
 *      Home · Explore · Members · Communities · Menu for a guest.
 *   3. Phone Menu: the who block, every section, the "You" group (the
 *      avatar menu's items, with the My cases pill rule), legal links.
 *   4. The model: Explore is lucide Compass, no nav item points at a moved
 *      route, Disputes is no primary item, the Watching tour target stays.
 *
 * Real components; the session and the /me/badges payload are mocked.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { Compass } from "lucide-react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: { user: { handle: "anvil", name: "Anvil Smith" } } as unknown,
  path: "/",
  badges: undefined as Record<string, unknown> | undefined,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: state.session, status: state.session ? "authenticated" : "unauthenticated" }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => state.path,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("@/hooks/useUser", () => ({ useUser: () => ({ data: undefined }) }));
vi.mock("@/lib/auth/session-boundary", () => ({ endSession: vi.fn() }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/composer/NewPostTrigger", () => ({
  NewPostTrigger: ({ ariaLabel, children }: { ariaLabel?: string; children?: React.ReactNode }) => (
    <button type="button" aria-label={ariaLabel}>{ariaLabel === undefined ? children : null}</button>
  ),
}));
// The real useOpenCaseCount runs over this payload.
vi.mock("@/hooks/useBadges", () => ({
  useBadges: () => ({
    data: state.badges,
    isLoading: false,
    error: null,
    openThreadIds: [],
    registerOpenThread: () => {},
    unregisterOpenThread: () => {},
  }),
}));

const { LeftSidebar } = await import("@/components/layout/LeftSidebar");
const { MobileNav } = await import("@/components/layout/nav/MobileNav");
const { MainOffcanvas } = await import("@/components/layout/offcanvas/MainOffcanvas");
const { MEMBER_NAV, PHONE_BAR_GUEST, PHONE_BAR_SIGNED_IN, PRIMARY_NAV, YOU_ITEMS } = await import(
  "@/components/layout/nav-items"
);

const MEMBER = { user: { handle: "anvil", name: "Anvil Smith" } };

beforeAll(() => {
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => {
  cleanup();
  state.session = MEMBER;
  state.path = "/";
  state.badges = undefined;
});

const primaryNav = () => screen.getByRole("navigation", { name: "Primary navigation" });
/** Each row's label: the row's first span (a sub-label follows it). */
const rowLabels = (nav: HTMLElement) =>
  within(nav).getAllByRole("link").map((a) => a.firstElementChild?.textContent?.trim() ?? "");
/** The sub-label of the row whose label is `label`, or null. */
function subLabel(nav: HTMLElement, label: string): string | null {
  const row = within(nav)
    .getAllByRole("link")
    .find((a) => a.firstElementChild?.textContent?.trim() === label);
  expect(row, label).toBeDefined();
  const sub = row?.querySelector(":scope > .bcc-mono");
  return sub === null || sub === undefined ? null : (sub.textContent ?? "");
}
const MOVED = /^\/(halls|directory|validators|mentors)(?=[/?#]|$)/;

function expectGroupsWithRule(nav: HTMLElement) {
  expect(rowLabels(nav)).toEqual(["Home", "Explore", "Members", "Communities", "Messages", "Watching"]);
  const rules = nav.querySelectorAll("hr");
  expect(rules).toHaveLength(1);
  const rule = rules[0] as HTMLElement;
  expect(rule.className).toContain("border-dashed");
  expect(rule.previousElementSibling?.getAttribute("href")).toBe("/communities");
  expect(rule.nextElementSibling?.getAttribute("href")).toBe("/messages");
}

function expectSubLabels(nav: HTMLElement) {
  expect(subLabel(nav, "Home")).toBeNull();
  expect(subLabel(nav, "Explore")).toBe("pages");
  expect(subLabel(nav, "Members")).toBe("people");
  expect(subLabel(nav, "Communities")).toBe("groups");
  // The sub-label is part of the name, separated by a space.
  expect(within(nav).getByRole("link", { name: "Explore pages" })).toHaveAttribute("href", "/explore");
}

describe("1. desktop sidebar", () => {
  it("member: two groups split by a dashed rule, with mono sub-labels", () => {
    render(<LeftSidebar collapsed={false} onToggle={() => {}} />);
    const nav = primaryNav();
    expectGroupsWithRule(nav);
    expectSubLabels(nav);
    expect(subLabel(nav, "Messages")).toBeNull();
    expect(subLabel(nav, "Watching")).toBe("your list");
    expect(nav.querySelector(":scope a .bcc-mono")?.className).toContain("text-[10px]");
    // A member posts from here, and has no sign-up buttons.
    expect(screen.getByRole("button", { name: /New Post/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Join the Floor" })).toBeNull();
  });

  it("guest: the four sections, Join the Floor and Sign in, nothing of a member's", () => {
    state.session = null;
    render(<LeftSidebar collapsed={false} onToggle={() => {}} />);
    const nav = primaryNav();
    expect(rowLabels(nav)).toEqual(["Home", "Explore", "Members", "Communities"]);
    expect(nav.querySelector("hr")).toBeNull();
    expectSubLabels(nav);
    expect(screen.queryByRole("link", { name: /Messages|Watching/ })).toBeNull();
    expect(screen.getByRole("link", { name: "Join the Floor" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    for (const name of ["Join the Floor", "Sign in"]) {
      expect(screen.getByRole("link", { name }).className).toContain("min-h-[44px]");
    }
    expect(screen.queryByRole("button", { name: /New Post/ })).toBeNull();
  });

  it("keeps the legal links at the foot, for both", () => {
    for (const session of [MEMBER, null]) {
      state.session = session;
      render(<LeftSidebar collapsed={false} onToggle={() => {}} />);
      for (const [name, href] of [["Terms", "/terms"], ["Privacy", "/privacy"], ["Cookies", "/cookies"]] as const) {
        expect(screen.getByRole("link", { name })).toHaveAttribute("href", href);
      }
      cleanup();
    }
  });

  it("the icon rail hides labels and sub-labels, not the rule", () => {
    render(<LeftSidebar collapsed onToggle={() => {}} />);
    const nav = primaryNav();
    expect(nav.querySelectorAll("a .bcc-mono")).toHaveLength(0);
    expect(nav.querySelectorAll("hr")).toHaveLength(1);
    expect(within(nav).getByTitle("Explore")).toHaveAttribute("href", "/explore");
  });

  it("keeps the Watching tour target, on the Watching row", () => {
    render(<LeftSidebar collapsed={false} onToggle={() => {}} />);
    const target = document.querySelector('[data-bcc-tour="nav.watching"]');
    expect(target?.closest("a")).toHaveAttribute("href", "/watching");
    expect(document.querySelectorAll('[data-bcc-tour="nav.watching"]')).toHaveLength(1);
  });

  it("draws Explore with lucide Compass", () => {
    const expected = render(<Compass />).container.querySelector("svg")?.getAttribute("class");
    cleanup();
    render(<LeftSidebar collapsed={false} onToggle={() => {}} />);
    const svg = within(primaryNav()).getByRole("link", { name: "Explore pages" }).querySelector("svg");
    expect(expected).toBeTruthy();
    expect(svg?.getAttribute("class")).toBe(expected);
  });
});

describe("2. phone bar", () => {
  /** The bar's slots in order: link text, "+" for New Post, "Menu". */
  function slots(): string[] {
    const nav = screen.getByRole("navigation", { name: "Mobile navigation" });
    return Array.from(nav.children).map((el) => {
      if (el.querySelector('[aria-label="New Post"]') !== null) return "+";
      return el.textContent?.trim() ?? "";
    });
  }

  it("member: Home · Explore · ＋ · Communities · Menu", () => {
    const onMenuOpen = vi.fn();
    render(<MobileNav onMenuOpen={onMenuOpen} />);
    expect(slots()).toEqual(["Home", "Explore", "+", "Communities", "Menu"]);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Explore" })).toHaveAttribute("href", "/explore");
    expect(screen.getByRole("link", { name: "Communities" })).toHaveAttribute("href", "/communities");
    expect(screen.queryByRole("link", { name: "Members" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(onMenuOpen).toHaveBeenCalledTimes(1);
  });

  it("guest: Home · Explore · Members · Communities · Menu, and no ＋", () => {
    state.session = null;
    render(<MobileNav onMenuOpen={() => {}} />);
    expect(slots()).toEqual(["Home", "Explore", "Members", "Communities", "Menu"]);
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute("href", "/members");
    expect(screen.queryByRole("button", { name: "New Post" })).toBeNull();
  });

  it("matches the model's two bars", () => {
    const shape = (bar: typeof PHONE_BAR_GUEST) =>
      bar.map((slot) => (slot.kind === "link" ? slot.item.label : slot.kind));
    expect(shape(PHONE_BAR_SIGNED_IN)).toEqual(["Home", "Explore", "post", "Communities", "menu"]);
    expect(shape(PHONE_BAR_GUEST)).toEqual(["Home", "Explore", "Members", "Communities", "menu"]);
  });

  it("links to no moved route, for either viewer", () => {
    for (const session of [MEMBER, null]) {
      state.session = session;
      const { container } = render(<MobileNav onMenuOpen={() => {}} />);
      for (const a of Array.from(container.querySelectorAll("a[href]"))) {
        expect(a.getAttribute("href")).not.toMatch(MOVED);
      }
      cleanup();
    }
  });
});

describe("3. phone Menu", () => {
  it("member: who block, both groups with sub-labels, the You group, legal at the foot", () => {
    state.path = "/me/progression";
    render(<MainOffcanvas open onClose={() => {}} />);

    expect(screen.getByText("Anvil Smith")).toBeInTheDocument();
    expect(screen.getByText("@anvil")).toBeInTheDocument();

    const nav = primaryNav();
    expectGroupsWithRule(nav);
    expectSubLabels(nav);
    expect(subLabel(nav, "Watching")).toBe("your list");
    expect(document.querySelector('[data-bcc-tour="nav.watching"]')?.closest("a")).toHaveAttribute("href", "/watching");

    const you = screen.getByRole("navigation", { name: "You" });
    const links = within(you).getAllByRole("link");
    expect(links.map((a) => a.textContent?.trim())).toEqual([
      "My profile", "Standing", "My Reliability", "My cases", "Settings",
    ]);
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "/u/anvil", "/me/progression", "/me/reliability", "/disputes", "/u/me?tab=profile",
    ]);
    expect(within(you).getByRole("link", { name: "Standing" })).toHaveAttribute("aria-current", "page");

    // Legal links come after both navs.
    const terms = screen.getByRole("link", { name: "Terms" });
    expect(you.compareDocumentPosition(terms) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("guest: only the public sections and the legal links", () => {
    state.session = null;
    render(<MainOffcanvas open onClose={() => {}} />);
    expect(rowLabels(primaryNav())).toEqual(["Home", "Explore", "Members", "Communities"]);
    expect(screen.queryByRole("navigation", { name: "You" })).toBeNull();
    expect(screen.queryByRole("link", { name: /My cases|My profile|Standing|Settings/ })).toBeNull();
    for (const name of ["Terms", "Privacy", "Cookies"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it.each([
    [1, "My cases 1 open"],
    [3, "My cases 3 open"],
  ])("My cases shows the pill for %s", (count, name) => {
    state.badges = { disputes_open: count };
    render(<MainOffcanvas open onClose={() => {}} />);
    const link = screen.getByRole("link", { name });
    expect(within(link).getByTestId("open-cases-pill")).toHaveTextContent(`${count} open`);
  });

  it.each([
    ["0", 0],
    ["null", null],
    ["-1", -1],
    ["1.5", 1.5],
    ['"2"', "2"],
  ])("My cases shows no pill for %s", (_label, value) => {
    state.badges = { disputes_open: value };
    render(<MainOffcanvas open onClose={() => {}} />);
    expect(screen.getByRole("link", { name: "My cases" })).toBeInTheDocument();
    expect(screen.queryByTestId("open-cases-pill")).toBeNull();
  });

  it("My cases shows no pill when the field is absent", () => {
    state.badges = { messages_unread: 0 };
    render(<MainOffcanvas open onClose={() => {}} />);
    expect(screen.getByRole("link", { name: "My cases" })).toBeInTheDocument();
    expect(screen.queryByTestId("open-cases-pill")).toBeNull();
  });

  it("carries no admin link, even for a moderator (Admin is avatar-only)", () => {
    state.session = { user: { handle: "anvil", canModerate: true } };
    const { container } = render(<MainOffcanvas open onClose={() => {}} />);
    expect(container.querySelector('a[href^="/admin/"]')).toBeNull();
  });
});

describe("4. the nav model", () => {
  const ALL = [...PRIMARY_NAV, ...MEMBER_NAV];

  it("Explore is lucide Compass", () => {
    expect(PRIMARY_NAV.find((item) => item.label === "Explore")?.Icon).toBe(Compass);
  });

  it("no item points at a moved route (Halls, Directory, Validators, Mentors)", () => {
    for (const href of [...ALL.map((item) => item.href), ...YOU_ITEMS.map((item) => item.href)]) {
      expect(href).not.toMatch(MOVED);
    }
    for (const label of ["Halls", "Directory", "Validators", "Mentors"]) {
      expect(ALL.map((item) => item.label)).not.toContain(label);
    }
  });

  it("Disputes is no primary item; it is My cases in the You items", () => {
    expect(ALL.map((item) => item.label)).not.toContain("Disputes");
    expect(ALL.map((item) => item.href)).not.toContain("/disputes");
    expect(YOU_ITEMS.find((item) => item.href === "/disputes")?.label).toBe("My cases");
  });

  it("the rendered sidebar and Menu link to no moved route", () => {
    for (const session of [MEMBER, null]) {
      state.session = session;
      for (const ui of [<LeftSidebar key="s" collapsed={false} onToggle={() => {}} />, <MainOffcanvas key="m" open onClose={() => {}} />]) {
        const { container } = render(ui);
        for (const a of Array.from(container.querySelectorAll("a[href]"))) {
          expect(a.getAttribute("href")).not.toMatch(MOVED);
        }
        cleanup();
      }
    }
  });
});
