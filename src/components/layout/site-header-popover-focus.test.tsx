/**
 * F-325 — the header pop-ups (theme, messages, notifications, avatar menu)
 * are usable from the keyboard and announce their state.
 *
 * Before: opening one left focus on the trigger, Tab walked straight out
 * of it (and, because the panels render after the avatar button, Tab from
 * the bell reached the avatar before the bell's own panel), and Esc closed
 * it leaving focus on <body>. Triggers said nothing about the panel.
 *
 * Also pinned: the avatar menu picks Sign Out and "Show me around" by item
 * id, not by label (review INFO on #256).
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TOUR_REQUEST_EVENT } from "@/lib/tour/replay";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { handle: "welder" } }, status: "authenticated" }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
// SiteHeader's only dynamic import is SignOutModal: stand in a marker.
vi.mock("next/dynamic", () => ({
  default: () => () => <div role="dialog" aria-label="Sign out" />,
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useNotifications", () => ({ useUnreadCount: () => ({ data: { unread_count: 0 } }) }));
vi.mock("@/hooks/useUnreadMessageCount", () => ({ useUnreadMessageCount: () => 0 }));
vi.mock("@/hooks/useUser", () => ({ useUser: () => ({ data: undefined }) }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/messages/ConversationsPanel", () => ({ ConversationsPanel: () => null }));
vi.mock("@/components/notifications/NotificationsPanel", () => ({
  NotificationsPanel: () => (
    <ul>
      <li>
        <a href="/n/1">first notification</a>
      </li>
    </ul>
  ),
}));
vi.mock("@/components/search/GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));

const { SiteHeader } = await import("@/components/layout/SiteHeader");

const bell = () => screen.getByRole("button", { name: /^Notifications/ });
const avatar = () => screen.getByRole("button", { name: "User menu" });
const key = (k: string, opts: { shiftKey?: boolean } = {}) =>
  fireEvent.keyDown(document.activeElement ?? document.body, { key: k, ...opts });

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
afterEach(cleanup);

describe("header pop-ups — focus", () => {
  it("opening the bell moves focus into its panel", () => {
    render(<SiteHeader />);
    fireEvent.click(bell());
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("Tab wraps last → first, Shift+Tab first → last, and Tab from outside lands inside", () => {
    render(<SiteHeader />);
    fireEvent.click(bell());
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    // jsdom does not move focus on a synthetic Tab, so each case asserts
    // the exact element the trap chose, not merely "still inside".
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>("a[href],button"));
    const first = focusables[0] as HTMLElement;
    const last = focusables[focusables.length - 1] as HTMLElement;
    expect(focusables.length).toBeGreaterThan(1);

    last.focus();
    key("Tab");
    expect(document.activeElement).toBe(first);

    first.focus();
    key("Tab", { shiftKey: true });
    expect(document.activeElement).toBe(last);

    avatar().focus();
    key("Tab");
    expect(document.activeElement).toBe(first);
  });

  it("Esc closes the panel and returns focus to the bell", () => {
    render(<SiteHeader />);
    fireEvent.click(bell());
    key("Escape");
    expect(screen.queryByRole("dialog", { name: "Notifications" })).toBeNull();
    expect(document.activeElement).toBe(bell());
  });
});

describe("header pop-ups — triggers announce the panel", () => {
  it("aria-expanded / aria-controls / aria-haspopup on the bell and the avatar", () => {
    render(<SiteHeader />);
    expect(bell()).toHaveAttribute("aria-haspopup", "dialog");
    expect(bell()).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(bell());
    expect(bell()).toHaveAttribute("aria-expanded", "true");
    const panel = screen.getByRole("dialog", { name: "Notifications" });
    expect(bell()).toHaveAttribute("aria-controls", panel.id);
    expect(panel).toHaveAttribute("aria-modal", "true");

    key("Escape");
    expect(avatar()).toHaveAttribute("aria-haspopup", "menu");
    fireEvent.click(avatar());
    expect(avatar()).toHaveAttribute("aria-expanded", "true");
    expect(avatar()).toHaveAttribute("aria-controls", screen.getByRole("menu", { name: "User menu" }).id);
  });
});

describe("avatar menu", () => {
  it("focuses the first item; arrow keys move between items and wrap", () => {
    render(<SiteHeader />);
    fireEvent.click(avatar());
    const items = screen.getAllByRole("menuitem");
    expect(document.activeElement).toBe(items[0]);
    key("ArrowUp");
    expect(document.activeElement).toBe(items[items.length - 1]);
    key("ArrowDown");
    expect(document.activeElement).toBe(items[0]);
    key("End");
    expect(document.activeElement).toBe(items[items.length - 1]);
  });

  it("Sign Out (picked by id) opens the sign-out dialog; Show me around requests the tour", () => {
    const requested: unknown[] = [];
    const listener = (e: Event) => requested.push((e as CustomEvent).detail);
    window.addEventListener(TOUR_REQUEST_EVENT, listener);

    render(<SiteHeader />);
    fireEvent.click(avatar());
    fireEvent.click(screen.getByRole("menuitem", { name: /show me around/i }));
    expect(requested).toEqual(["home-feed"]);

    fireEvent.click(avatar());
    const signOut = screen.getByRole("menuitem", { name: /sign out/i });
    expect(signOut.tagName).toBe("BUTTON");
    fireEvent.click(signOut);
    expect(screen.getByRole("dialog", { name: "Sign out" })).toBeInTheDocument();

    window.removeEventListener(TOUR_REQUEST_EVENT, listener);
  });
});
