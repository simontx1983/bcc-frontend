/**
 * F-264 (UX Low 4) — the phone search overlay is a real modal dialog.
 *
 * It was a hand-made role="dialog": no aria-modal, no focus trap, no focus
 * return, Esc only while the input had focus, and a trigger with no
 * aria-haspopup / aria-expanded / aria-controls. Its backdrop value read
 * `"var(--bcc-glass-bg-frosted);"`; the stray semicolon made the whole
 * declaration invalid, so the backdrop was clear.
 *
 * It now shares the header's useModalDismiss with the other four pop-ups:
 * focus moves to the input, Tab stays inside, Esc from anywhere and a
 * click outside close it, and focus goes back to the search button.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next-auth/react", () => ({ useSession: () => ({ data: null, status: "unauthenticated" }) }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: state.push, refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/image", () => ({ default: () => null }));
vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => true }));
vi.mock("@/hooks/useNotifications", () => ({ useUnreadCount: () => ({ data: { unread_count: 0 } }) }));
vi.mock("@/hooks/useUnreadMessageCount", () => ({ useUnreadMessageCount: () => 0 }));
vi.mock("@/hooks/useUser", () => ({ useUser: () => ({ data: undefined }) }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/messages/ConversationsPanel", () => ({ ConversationsPanel: () => null }));
vi.mock("@/components/notifications/NotificationsPanel", () => ({ NotificationsPanel: () => null }));
vi.mock("@/components/search/GlobalSearch", () => ({ GlobalSearch: () => null }));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "http://localhost/wp-json/bcc/v1" } }));

const { SiteHeader } = await import("@/components/layout/SiteHeader");

const trigger = () => screen.getByRole("button", { name: "Search" });
const dialog = () => screen.queryByRole("dialog", { name: "Search" });
const box = () => screen.getByRole("searchbox", { name: "Search BCC" });

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
  window.history.replaceState({}, "", "/");
});
afterEach(cleanup);

describe("F-264 — the phone search overlay is a modal dialog", () => {
  it("the trigger says it opens a dialog, and names it while open", () => {
    render(<SiteHeader />);
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().hasAttribute("aria-controls")).toBe(false);

    fireEvent.click(trigger());
    const panel = dialog();
    expect(panel).not.toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(trigger().getAttribute("aria-controls")).toBe(panel?.id);
    expect(panel?.id).toBe("bcc-header-search-panel");
    expect(panel?.getAttribute("aria-modal")).toBe("true");
  });

  it("focus moves into the input on open", () => {
    render(<SiteHeader />);
    fireEvent.click(trigger());
    expect(document.activeElement).toBe(box());
  });

  it("Tab stays inside the dialog", () => {
    render(<SiteHeader />);
    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(box());
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(box());
  });

  it("Esc closes it from anywhere, not only from the input, and focus returns to the trigger", () => {
    render(<SiteHeader />);
    fireEvent.click(trigger());
    // Focus on the panel itself, not the input.
    dialog()?.focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("a click outside (the backdrop) closes it and focus returns to the trigger", () => {
    render(<SiteHeader />);
    fireEvent.click(trigger());
    fireEvent.mouseDown(screen.getByTestId("search-overlay-backdrop"));
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it("the trigger toggles it closed", () => {
    render(<SiteHeader />);
    fireEvent.click(trigger());
    fireEvent.mouseDown(trigger());
    fireEvent.click(trigger());
    expect(dialog()).toBeNull();
  });

  it("the backdrop's frosted background is a valid declaration (no stray semicolon)", () => {
    render(<SiteHeader />);
    fireEvent.click(trigger());
    const backdrop = screen.getByTestId("search-overlay-backdrop");
    expect(backdrop.style.background).toBe("var(--bcc-glass-bg-frosted)");
  });

  it("Enter still searches: /search?q= and the overlay closes", () => {
    render(<SiteHeader />);
    fireEvent.click(trigger());
    fireEvent.change(box(), { target: { value: " cosmos hub " } });
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(state.push).toHaveBeenCalledWith("/search?q=cosmos%20hub");
    expect(dialog()).toBeNull();
  });

  it("Enter on an empty box does nothing", () => {
    render(<SiteHeader />);
    fireEvent.click(trigger());
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(state.push).not.toHaveBeenCalled();
    expect(dialog()).not.toBeNull();
  });
});
