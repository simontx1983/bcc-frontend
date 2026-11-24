/**
 * Site-structure audit, the small fixes that hold under any structure:
 *   1. a Hall's collections panel links nowhere that doesn't exist;
 *   2. the landing's floor peek leads to the (members-only) feed via sign-up;
 *   3. the directory and validators filter chips print option labels, not
 *      wire slugs, and the tier filter says "Elite" like the card chip;
 *   4. guests aren't shown Messages, Disputes or Watching (they bounce to
 *      /login), in either nav.
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  data: { user: { handle: "anvil" } } as { user?: { handle?: string } } | null,
}));
const search = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: session.data, status: session.data ? "authenticated" : "unauthenticated" }),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => search.params,
}));
vi.mock("@/lib/env", () => ({ clientEnv: { BCC_API_URL: "https://wp.example" } }));
vi.mock("@/hooks/useUser", () => ({ useUser: () => ({ data: undefined }) }));
vi.mock("@/lib/auth/session-boundary", () => ({ endSession: vi.fn() }));
vi.mock("@/components/identity/Avatar", () => ({ Avatar: () => null }));
vi.mock("@/components/layout/RouteRail", () => ({ RouteRail: () => null }));
vi.mock("@/components/directory/DirectoryResults", () => ({ DirectoryResults: () => null }));
// The landing's animated and data-backed parts: only the link under test matters.
vi.mock("@/components/landing/LandingFloorPeek", () => ({ LandingFloorPeek: () => null }));
vi.mock("@/components/landing/LandingLedger", () => ({ LandingLedger: () => null }));
vi.mock("@/components/landing/LandingEmbers", () => ({ LandingEmbers: () => null }));
vi.mock("@/components/landing/LandingCountUp", () => ({ LandingCountUp: () => null }));
vi.mock("@/components/landing/LandingReveal", () => ({
  LandingReveal: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/landing/LandingMagneticLink", () => ({
  LandingMagneticLink: ({ children, href }: { children?: ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

const { primaryNavFor, PRIMARY_NAV } = await import("@/components/layout/nav-items");
const { MainOffcanvas } = await import("@/components/layout/offcanvas/MainOffcanvas");
const { LeftSidebar } = await import("@/components/layout/LeftSidebar");
const { HallCollectionsPanel } = await import("@/components/halls/HallChainContent");
const { FloorIntro } = await import("@/components/landing/FloorIntro");
const { default: DirectoryPage } = await import("@/app/(main)/(app)/directory/page");
const { default: ValidatorsPage } = await import("@/app/(main)/(app)/validators/page");
const { TIER_OPTIONS } = await import("@/components/directory/DirectoryFilters");

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

const withQuery = (ui: ReactNode) =>
  render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const SIGNED_IN_ONLY = ["Messages", "Disputes", "Watching"];

function primaryNavLabels(): string[] {
  const nav = screen.getByRole("navigation", { name: "Primary navigation" });
  return within(nav).getAllByRole("link").map((a) => a.textContent?.trim() ?? "");
}

describe("4. the nav hides signed-in-only pages from guests", () => {
  it("primaryNavFor: everything for a member; no Messages, Disputes or Watching for a guest", () => {
    expect(primaryNavFor(true)).toBe(PRIMARY_NAV);
    const guest = primaryNavFor(false).map((item) => item.label);
    for (const label of SIGNED_IN_ONLY) expect(guest).not.toContain(label);
    expect(guest).toEqual(["Home", "Halls", "Members", "Directory", "Communities", "Validators", "Mentors"]);
  });

  it("mobile menu: a guest doesn't see them, a member does", () => {
    session.data = null;
    render(<MainOffcanvas open onClose={() => {}} />);
    for (const label of SIGNED_IN_ONLY) expect(primaryNavLabels()).not.toContain(label);
    cleanup();
    session.data = { user: { handle: "anvil" } };
    render(<MainOffcanvas open onClose={() => {}} />);
    for (const label of SIGNED_IN_ONLY) expect(primaryNavLabels()).toContain(label);
  });

  it("desktop sidebar: a guest doesn't see them, a member does", () => {
    session.data = null;
    withQuery(<LeftSidebar collapsed={false} onToggle={() => {}} />);
    for (const label of SIGNED_IN_ONLY) expect(primaryNavLabels()).not.toContain(label);
    cleanup();
    session.data = { user: { handle: "anvil" } };
    withQuery(<LeftSidebar collapsed={false} onToggle={() => {}} />);
    for (const label of SIGNED_IN_ONLY) expect(primaryNavLabels()).toContain(label);
  });
});

describe("3. filter chips print the option labels", () => {
  it("/directory: kind, tier and sort chips read Validators, Elite and Vouches", () => {
    search.params = new URLSearchParams("kind=validator&tier=elite&sort=endorsements");
    withQuery(<DirectoryPage />);
    expect(screen.getByRole("button", { name: "Clear filter VALIDATORS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filter ELITE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filter SORT · VOUCHES" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /VALIDATOR$|ENDORSEMENTS/ })).toBeNull();
  });

  it("/directory: the followers sort reads Watchers", () => {
    search.params = new URLSearchParams("sort=followers");
    withQuery(<DirectoryPage />);
    expect(screen.getByRole("button", { name: "Clear filter SORT · WATCHERS" })).toBeInTheDocument();
  });

  it("/validators: the self_stake sort reads Self stake", () => {
    search.params = new URLSearchParams("sort=self_stake&status=jailed");
    withQuery(<ValidatorsPage />);
    expect(screen.getByRole("button", { name: "Clear filter SORT · SELF STAKE" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear filter STATUS · JAILED" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /SELF_STAKE/ })).toBeNull();
  });

  it("the tier filter's elite option says Elite, like the card's tier chip", () => {
    expect(TIER_OPTIONS.find((option) => option.value === "elite")?.label).toBe("Elite");
    expect(TIER_OPTIONS.map((option) => option.label)).not.toContain("Proven");
  });
});

describe("1. a Hall's collections panel", () => {
  it("has no 'All N →' link to a page that doesn't exist", () => {
    const { container } = render(
      <HallCollectionsPanel
        chain="solana"
        collectionCount={12}
        collections={[{ id: 1, name: "Mad Lads", image_url: null, contract_address: "abc" }]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Collections on SOLANA" })).toBeInTheDocument();
    expect(container.querySelector('a[href="/cards"]')).toBeNull();
    expect(screen.queryByRole("link", { name: /All 12/ })).toBeNull();
  });
});

describe("2. the landing's floor peek", () => {
  it("leads guests to sign up for the feed, not to the directory", () => {
    const { container } = render(<FloorIntro />);
    const link = screen.getByRole("link", { name: "Join to see the whole floor →" });
    expect(link).toHaveAttribute("href", "/signup");
    expect(container.querySelector('a[href="/directory"]')).toBeNull();
  });
});
