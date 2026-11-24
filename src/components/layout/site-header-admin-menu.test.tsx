/**
 * The avatar menu is the only inbound link to the admin screens. It
 * carries Moderation and, right after it, Validators (validator admin V1).
 * No role gate — non-admins land on the page's "Admin access required"
 * panel — so the items render for every signed-in viewer.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { user: { handle: "welder" } }, status: "authenticated" }),
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
afterEach(cleanup);

describe("avatar menu — admin entries", () => {
  it("shows Validators, linking to /admin/validators, directly after Moderation", () => {
    render(<SiteHeader />);
    fireEvent.click(screen.getByRole("button", { name: "User menu" }));

    const validators = screen.getByRole("menuitem", { name: "Validators" });
    expect(validators).toHaveAttribute("href", "/admin/validators");

    const labels = screen.getAllByRole("menuitem").map((el) => el.textContent);
    const at = labels.indexOf("Moderation");
    expect(at).toBeGreaterThanOrEqual(0);
    expect(labels[at + 1]).toBe("Validators");
  });
});
