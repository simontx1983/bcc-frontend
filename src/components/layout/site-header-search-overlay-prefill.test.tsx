/**
 * F-260 M12 — the phone search overlay opens on /search's query.
 *
 * The overlay's input is uncontrolled and always opened empty, so on
 * /search?q=cosmos refining a search meant retyping it. It now opens
 * holding the page's ?q= on /search, and empty everywhere else. One-
 * character terms are still sent: /search answers them with a "type at
 * least 2 characters" sheet instead of a false "no matches".
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ pathname: "/", push: vi.fn() }));

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => state.pathname,
  useRouter: () => ({ push: state.push, refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => true }));
vi.mock("@/hooks/useNotifications", () => ({ useUnreadCount: () => ({ data: { unread_count: 0 } }) }));
vi.mock("@/hooks/useUnreadMessageCount", () => ({ useUnreadMessageCount: () => 0 }));
// SiteHeader reads the open-case count from /me/badges.
vi.mock("@/hooks/useOpenCaseCount", () => ({ useOpenCaseCount: () => null }));
vi.mock("@/hooks/useUser", () => ({ useUser: () => ({ data: undefined }) }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/messages/ConversationsPanel", () => ({ ConversationsPanel: () => null }));
vi.mock("@/components/notifications/NotificationsPanel", () => ({ NotificationsPanel: () => null }));
vi.mock("@/components/search/GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));

const { SiteHeader } = await import("@/components/layout/SiteHeader");

function at(path: string) {
  window.history.replaceState({}, "", path);
  state.pathname = new URL(path, "http://localhost").pathname;
}

function openOverlay() {
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  return screen.getByRole("searchbox", { name: "Search BCC" }) as HTMLInputElement;
}

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
  state.push.mockReset();
  at("/");
});
afterEach(cleanup);

describe("SiteHeader phone search overlay (F-260 M12)", () => {
  it("opens holding the query on /search", () => {
    at("/search?q=%20cosmos%20hub&tab=users");
    render(<SiteHeader />);
    expect(openOverlay().value).toBe("cosmos hub");
  });

  it("opens empty off /search, even with a q param", () => {
    at("/directory?q=cosmos");
    render(<SiteHeader />);
    expect(openOverlay().value).toBe("");
  });

  it("re-reads the query each time it opens", () => {
    at("/search?q=cosmos");
    render(<SiteHeader />);
    const first = openOverlay();
    expect(first.value).toBe("cosmos");
    fireEvent.keyDown(first, { key: "Escape" });

    at("/search?q=osmosis");
    expect(openOverlay().value).toBe("osmosis");
  });

  it("still submits a one-character term to /search", () => {
    render(<SiteHeader />);
    const input = openOverlay();
    fireEvent.change(input, { target: { value: "a" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(state.push).toHaveBeenCalledWith("/search?q=a");
  });
});
