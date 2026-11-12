/**
 * C1 (UX scan 2026-11-12): phones (≤599px) had no way to reach
 * notifications. The header bell rendered only on desktop, on the promise
 * that it "moves to offcanvas", which never landed: no badge, no list, no
 * "see all". The bell now renders at every width for a signed-in viewer,
 * with the same "9+" cap and accessible count as on desktop.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  mobile: true,
  session: { user: { handle: "welder" } } as unknown,
  unread: 0,
}));

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: state.session, status: "authenticated" }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => state.mobile }));
vi.mock("@/hooks/useNotifications", () => ({ useUnreadCount: () => ({ data: { unread_count: state.unread } }) }));
vi.mock("@/hooks/useUnreadMessageCount", () => ({ useUnreadMessageCount: () => 0 }));
vi.mock("@/hooks/useUser", () => ({ useUser: () => ({ data: undefined }) }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/messages/ConversationsPanel", () => ({ ConversationsPanel: () => null }));
vi.mock("@/components/notifications/NotificationsPanel", () => ({
  NotificationsPanel: () => <p>notifications list</p>,
}));
vi.mock("@/components/search/GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));

const { SiteHeader } = await import("@/components/layout/SiteHeader");

const bell = () => screen.queryByRole("button", { name: /^Notifications/ });

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
  state.mobile = true;
  state.session = { user: { handle: "welder" } };
  state.unread = 0;
});
afterEach(cleanup);

describe("SiteHeader notifications bell (C1)", () => {
  it("renders on a phone for a signed-in viewer", () => {
    render(<SiteHeader />);
    expect(bell()).not.toBeNull();
  });

  it("carries the unread count in its name, capped at 9+ in the badge", () => {
    state.unread = 12;
    render(<SiteHeader />);
    expect(bell()).toHaveAccessibleName("Notifications — 12 unread");
    expect(bell()?.textContent).toContain("9+");
  });

  it("opens the notifications list on a phone", () => {
    render(<SiteHeader />);
    fireEvent.click(bell() as HTMLElement);
    expect(screen.getByRole("dialog", { name: "Notifications" })).toBeInTheDocument();
    expect(screen.getByText("notifications list")).toBeInTheDocument();
  });

  it("still renders on desktop", () => {
    state.mobile = false;
    render(<SiteHeader />);
    expect(bell()).not.toBeNull();
  });

  it("is absent for a signed-out visitor", () => {
    state.session = null;
    render(<SiteHeader />);
    expect(bell()).toBeNull();
  });
});
