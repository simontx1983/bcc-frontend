/**
 * F-322 — the mobile menu offers "Show me around" to a signed-in member,
 * and choosing it asks the tour engine to replay the Floor tour.
 * (The engine side — a request starts the tour even when it is seen — is
 * pinned in components/tour/tour-once-per-account.test.tsx.)
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { SHOW_ME_AROUND_TOUR, TOUR_REQUEST_EVENT } from "@/lib/tour/replay";

const session = vi.hoisted(() => ({
  data: { user: { handle: "anvil" } } as { user?: { handle?: string } } | null,
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: session.data, status: session.data ? "authenticated" : "unauthenticated" }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/settings" }));
vi.mock("@/hooks/useUser", () => ({ useUser: () => ({ data: undefined }) }));
vi.mock("@/lib/auth/session-boundary", () => ({ endSession: vi.fn() }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));

const { MainOffcanvas } = await import("@/components/layout/offcanvas/MainOffcanvas");

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
afterEach(cleanup);

describe("MainOffcanvas — Show me around", () => {
  it("requests the Floor tour, closes the menu, and links to the Floor", () => {
    session.data = { user: { handle: "anvil" } };
    const onClose = vi.fn();
    const requested: unknown[] = [];
    const listener = (e: Event) => requested.push((e as CustomEvent).detail);
    window.addEventListener(TOUR_REQUEST_EVENT, listener);

    render(<MainOffcanvas open onClose={onClose} />);
    const link = screen.getByRole("link", { name: "Show me around" });
    expect(link).toHaveAttribute("href", "/");
    fireEvent.click(link);

    window.removeEventListener(TOUR_REQUEST_EVENT, listener);
    expect(requested).toEqual([SHOW_ME_AROUND_TOUR]);
    expect(onClose).toHaveBeenCalled();
  });

  it("is not offered to a signed-out visitor", () => {
    session.data = null;
    render(<MainOffcanvas open onClose={() => {}} />);
    expect(screen.queryByRole("link", { name: "Show me around" })).toBeNull();
  });
});
