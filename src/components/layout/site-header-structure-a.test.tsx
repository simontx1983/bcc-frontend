/**
 * Site Structure A, PR 3: the header.
 *
 *   1. A guest sees BOTH Sign In and Sign Up, on phones as on desktop
 *      (Sign In used to be hidden on phones).
 *   2. Avatar menu order: My profile · Standing · My Reliability ·
 *      My cases · Settings · Show me around · (Admin group) · rule ·
 *      Theme · Sign Out. Theme opens the Theme panel.
 *   3. Open cases (GET /me/badges `disputes_open`): the avatar's dot, its
 *      accessible count, and the "N open" pill on My cases appear ONLY for
 *      a finite integer above zero. 0, null, absent, negative, fractional
 *      or a string shows nothing.
 *
 * The real SiteHeader and the real useOpenCaseCount; the session and the
 * /me/badges payload are mocked.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: { user: { handle: "welder" } } as unknown,
  mobile: false,
  badges: undefined as Record<string, unknown> | undefined,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: state.session, status: state.session ? "authenticated" : "unauthenticated" }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({
  default: () => () => <div role="dialog" aria-label="Sign out" />,
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/hooks/useNotifications", () => ({ useUnreadCount: () => ({ data: { unread_count: 0 } }) }));
vi.mock("@/hooks/useUnreadMessageCount", () => ({ useUnreadMessageCount: () => 0 }));
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
vi.mock("@/hooks/useUser", () => ({ useUser: () => ({ data: undefined }) }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/messages/ConversationsPanel", () => ({ ConversationsPanel: () => null }));
vi.mock("@/components/notifications/NotificationsPanel", () => ({ NotificationsPanel: () => null }));
vi.mock("@/components/search/GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));

const { SiteHeader } = await import("@/components/layout/SiteHeader");

beforeEach(() => {
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
  state.session = { user: { handle: "welder" } };
  state.mobile = false;
  state.badges = undefined;
});

const avatar = () => screen.getByRole("button", { name: /^User menu/ });
const menuLabels = () => screen.getAllByRole("menuitem").map((el) => el.textContent?.trim());

describe("1. a guest's header", () => {
  it.each([
    ["phone", true],
    ["desktop", false],
  ])("%s: Sign In and Sign Up, both 44px targets, and no avatar", (_label, mobile) => {
    state.session = null;
    state.mobile = mobile;
    render(<SiteHeader />);
    const signIn = screen.getByRole("link", { name: "Sign In" });
    const signUp = screen.getByRole("link", { name: "Sign Up" });
    expect(signIn).toHaveAttribute("href", "/login");
    expect(signUp).toHaveAttribute("href", "/signup");
    for (const el of [signIn, signUp]) expect(el.className).toContain("before:h-11");
    expect(screen.queryByRole("button", { name: /^User menu/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Messages/ })).toBeNull();
  });

  /**
   * At 360px the brand plus the pair is a few px wider than the fixed header,
   * which would clip Sign In. jsdom can't evaluate media queries, so this pins
   * the pieces: the pair carries the class (not an inline gap a stylesheet
   * can't override), and globals.css tightens exactly that pair below 390px.
   */
  it("the pair is styled by class, and tightens below 390px without dropping either button", () => {
    state.session = null;
    state.mobile = true;
    render(<SiteHeader />);
    const pair = screen.getByRole("link", { name: "Sign In" }).parentElement as HTMLElement;
    expect(pair.className).toContain("bcc-header-guest-actions");
    expect(pair.getAttribute("style") ?? "").not.toMatch(/gap/);
    expect(pair).toContainElement(screen.getByRole("link", { name: "Sign Up" }));

    const css = readFileSync(join(process.cwd(), "src", "app", "globals.css"), "utf8");
    const narrow = /@media \(max-width: 389px\) \{([\s\S]*?)\r?\n {2}\}/.exec(css)?.[1] ?? "";
    expect(narrow).toMatch(/\.bcc-header-guest-actions \{\s*gap: 4px;/);
    expect(narrow).toMatch(/\.bcc-header-guest-actions \.bcc-btn-sm \{\s*padding-left: 8px;\s*padding-right: 8px;/);
    // Neither button is hidden at that width.
    expect(narrow).not.toMatch(/display:\s*none/);
  });
});

describe("2. avatar menu", () => {
  it("member: the You items, Show me around, a rule, Theme, Sign Out", () => {
    render(<SiteHeader />);
    fireEvent.click(avatar());
    expect(menuLabels()).toEqual([
      "My profile", "Standing", "My Reliability", "My cases", "Settings",
      "Show me around", "Theme", "Sign Out",
    ]);
    const href = (name: string) => screen.getByRole("menuitem", { name }).getAttribute("href");
    expect(href("My profile")).toBe("/u/welder");
    expect(href("Standing")).toBe("/me/progression");
    expect(href("My Reliability")).toBe("/me/reliability");
    expect(href("My cases")).toBe("/disputes");
    expect(href("Settings")).toBe("/u/me?tab=profile");

    // The rule sits between Show me around and Theme.
    const menu = screen.getByRole("menu", { name: "User menu" });
    const rules = within(menu).getAllByRole("separator");
    expect(rules).toHaveLength(1);
    const rule = rules[0] as HTMLElement;
    const before = screen.getByRole("menuitem", { name: "Show me around" });
    const after = screen.getByRole("menuitem", { name: "Theme" });
    expect(before.compareDocumentPosition(rule) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rule.compareDocumentPosition(after) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("moderator: the Admin group sits before the rule", () => {
    state.session = { user: { handle: "welder", canModerate: true } };
    render(<SiteHeader />);
    fireEvent.click(avatar());
    expect(menuLabels()).toEqual([
      "My profile", "Standing", "My Reliability", "My cases", "Settings",
      "Show me around", "Moderation", "Validators", "Theme", "Sign Out",
    ]);
  });

  it("Theme opens the Theme panel", () => {
    render(<SiteHeader />);
    fireEvent.click(avatar());
    fireEvent.click(screen.getByRole("menuitem", { name: "Theme" }));
    expect(screen.queryByRole("menu", { name: "User menu" })).toBeNull();
    const panel = screen.getByRole("dialog", { name: "Theme settings" });
    expect(panel.contains(document.activeElement)).toBe(true);
  });
});

describe("3. open cases: dot, count and pill", () => {
  it.each([
    [1, "User menu — 1 open case"],
    [3, "User menu — 3 open cases"],
  ])("%s: a dot on the avatar, the count in its name, the pill on My cases", (count, name) => {
    state.badges = { messages_unread: 0, notifications_unread: 0, disputes_open: count };
    render(<SiteHeader />);

    const button = screen.getByRole("button", { name });
    const dot = within(button).getByTestId("avatar-open-cases-dot");
    expect(dot).toHaveAttribute("aria-hidden", "true");
    expect(dot.className).toContain("bg-safety");

    fireEvent.click(button);
    const cases = screen.getByRole("menuitem", { name: `My cases ${count} open` });
    expect(within(cases).getByTestId("open-cases-pill")).toHaveTextContent(`${count} open`);
  });

  it.each([
    ["0", 0],
    ["null", null],
    ["-1", -1],
    ["1.5", 1.5],
    ['the string "2"', "2"],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("%s: no dot, no count, no pill", (_label, value) => {
    state.badges = { messages_unread: 0, notifications_unread: 0, disputes_open: value };
    render(<SiteHeader />);
    expectNothing();
  });

  it("absent field: no dot, no count, no pill", () => {
    state.badges = { messages_unread: 0, notifications_unread: 0 };
    render(<SiteHeader />);
    expectNothing();
  });

  it("no payload yet: no dot, no count, no pill", () => {
    state.badges = undefined;
    render(<SiteHeader />);
    expectNothing();
  });

  function expectNothing() {
    const button = screen.getByRole("button", { name: "User menu" });
    expect(screen.queryByTestId("avatar-open-cases-dot")).toBeNull();
    fireEvent.click(button);
    expect(screen.getByRole("menuitem", { name: "My cases" })).toBeInTheDocument();
    expect(screen.queryByTestId("open-cases-pill")).toBeNull();
  }
});
