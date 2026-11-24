/**
 * The avatar menu is the only inbound link to the admin screens. Its
 * "Admin" group carries Moderation and, right after it, Validators
 * (validator admin V1).
 *
 * Role gate (Site Structure A, bcc-trust #876): the group renders ONLY
 * when the session's `canModerate` is exactly `true`. It is display only
 * and fails closed: absent, false, or anything that is not the boolean
 * true hides it. The server re-checks every admin request either way, and
 * a non-admin who reaches the URL gets the page's "Admin access required"
 * panel.
 */

import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: { handle: "welder" } as Record<string, unknown> }));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: state.user }, status: "authenticated" }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({
  default: () => () => <div role="dialog" aria-label="Sign out" />,
}));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/useNotifications", () => ({ useUnreadCount: () => ({ data: { unread_count: 0 } }) }));
vi.mock("@/hooks/useUnreadMessageCount", () => ({ useUnreadMessageCount: () => 0 }));
vi.mock("@/hooks/useOpenCaseCount", () => ({ useOpenCaseCount: () => null }));
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
  state.user = { handle: "welder" };
});

function openMenu(user: Record<string, unknown>) {
  state.user = user;
  render(<SiteHeader />);
  fireEvent.click(screen.getByRole("button", { name: "User menu" }));
}

describe("avatar menu — Admin group", () => {
  it("canModerate === true: an Admin group with Moderation, then Validators", () => {
    openMenu({ handle: "welder", canModerate: true });

    const group = screen.getByRole("group", { name: "Admin" });
    const items = within(group).getAllByRole("menuitem");
    expect(items.map((el) => el.textContent)).toEqual(["Moderation", "Validators"]);
    expect(items[0]).toHaveAttribute("href", "/admin/moderation");
    expect(items[1]).toHaveAttribute("href", "/admin/validators");
  });

  it.each([
    ["absent", {}],
    ["false", { canModerate: false }],
    ['the string "true"', { canModerate: "true" }],
    ["1", { canModerate: 1 }],
    ["null", { canModerate: null }],
  ])("canModerate %s: no Admin group, no admin links", (_label, extra) => {
    openMenu({ handle: "welder", ...extra });

    expect(screen.queryByRole("group", { name: "Admin" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Moderation" })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Validators" })).toBeNull();
    const menu = screen.getByRole("menu", { name: "User menu" });
    expect(menu.querySelector('a[href^="/admin/"]')).toBeNull();
    // The rest of the menu is still there.
    expect(screen.getByRole("menuitem", { name: "My profile" })).toBeInTheDocument();
  });
});
