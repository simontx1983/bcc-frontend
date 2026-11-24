/**
 * Site Structure A, PR 4a: one section template for Explore, Members and
 * Communities (design §10).
 *   1. SectionHeader: eyebrow · the menu word as title · one-sentence lede
 *      · an optional action, and no empty action slot.
 *   2. Tab counts: on the ACTIVE tab only, and only when the server sent
 *      a total (no made-up 0).
 *   3. Every section page uses SectionHeader with its menu word, and no
 *      private header copy is left.
 *   4. Mentors counts only when the rows really are mentors.
 *   5. Members' first-visit note: shown once, dismissal goes to the tours
 *      seen-set, nothing outside the provider or before the set is ready.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { TourContextValue } from "@/components/tour/tour-context";

const members = vi.hoisted(() => ({
  value: { isSuccess: false, isPending: true, isError: false, data: undefined } as Record<string, unknown>,
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/members/mentors",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/hooks/useMembers", () => ({ useMembers: () => members.value }));
vi.mock("@/components/cards/CardGrid", () => ({ CardGrid: () => null }));
vi.mock("@/components/layout/RouteRail", () => ({ RouteRail: () => null }));

const { SectionHeader } = await import("@/components/layout/SectionHeader");
const { SectionTabs, withActiveCount } = await import("@/components/ui/SectionTabs");
const { RankTrustNote, RANK_TRUST_NOTE_ID } = await import("@/components/members/RankTrustNote");
const { TourContext } = await import("@/components/tour/tour-context");
const { EXPLORE_SECTION } = await import("@/app/(main)/(app)/explore/explore-tabs");
const { MEMBERS_SECTION, MEMBERS_TABS } = await import("@/app/(main)/(app)/members/members-tabs");
const { default: MentorsPage } = await import("@/app/(main)/(app)/members/mentors/page");

afterEach(cleanup);

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const APP = "src/app/(main)/(app)";

describe("1. SectionHeader", () => {
  it("renders eyebrow, the title as the page h1, the lede and the action", () => {
    render(
      <SectionHeader eyebrow="COMMUNITIES · GROUPS" title="Communities" lede="Places you join." action={<button type="button">Create</button>} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Communities" })).toBeInTheDocument();
    expect(screen.getByText("COMMUNITIES · GROUPS")).toBeInTheDocument();
    expect(screen.getByText("Places you join.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
  });

  it("leaves no empty action slot when there is no action", () => {
    const { container } = render(<SectionHeader eyebrow="E" title="Explore" lede="L" />);
    expect(container.querySelectorAll("header > div > div")).toHaveLength(1);
  });
});

describe("2. tab counts", () => {
  it("sets the count on the active tab only", () => {
    const tabs = withActiveCount(MEMBERS_TABS, "/members", 1208);
    expect(tabs.map((t) => t.count)).toEqual([1208, undefined]);
  });

  it("no total from the server → no count anywhere (no made-up 0)", () => {
    expect(withActiveCount(MEMBERS_TABS, "/members", undefined)).toBe(MEMBERS_TABS);
  });

  it("renders the count beside the label, formatted", () => {
    render(<SectionTabs label="Members sections" tabs={withActiveCount(MEMBERS_TABS, "/members", 1208)} />);
    expect(screen.getByRole("link", { name: /Everyone\s*1,208/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Mentors" })).toBeInTheDocument();
  });
});

describe("3. every section page uses the template, titled with its menu word", () => {
  it("the section words", () => {
    expect(EXPLORE_SECTION.title).toBe("Explore");
    expect(MEMBERS_SECTION.title).toBe("Members");
    expect(read(`${APP}/communities/page.tsx`)).toMatch(/title: "Communities",/);
  });

  it.each([
    `${APP}/explore/page.tsx`,
    `${APP}/explore/KindDirectoryPage.tsx`,
    `${APP}/members/page.tsx`,
    `${APP}/members/mentors/page.tsx`,
    `${APP}/communities/page.tsx`,
  ])("%s renders SectionHeader and no private h1", (file) => {
    const src = read(file);
    expect(src).toContain("<SectionHeader");
    expect(src).not.toMatch(/<h1\b/);
  });
});

describe("4. Mentors counts only real mentors", () => {
  const wrap = (ui: ReactNode) => (
    <QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>
  );
  const page = (isMentor: boolean) => ({
    isSuccess: true,
    isPending: false,
    isError: false,
    isFetching: false,
    data: {
      items: [{ id: 1, is_mentor: isMentor }],
      pagination: { page: 1, per_page: 24, total: 14, total_pages: 1 },
      type_counts: { validator: 0, project: 0, nft: 0, dao: 0 },
    },
  });

  it("rows carry is_mentor → the tab shows the total", () => {
    members.value = page(true);
    render(wrap(<MentorsPage />));
    expect(screen.getByRole("link", { name: /Mentors\s*14/ })).toHaveAttribute("aria-current", "page");
  });

  it("an older backend ignored mentors=1 (no flags) → no count", () => {
    members.value = page(false);
    render(wrap(<MentorsPage />));
    expect(screen.getByRole("link", { name: "Mentors" })).toBeInTheDocument();
  });
});

describe("5. Members' first-visit note", () => {
  const ctx = (over: Partial<TourContextValue>): TourContextValue =>
    ({ seenReady: true, hasSeen: () => false, markSeen: vi.fn(), ...over }) as unknown as TourContextValue;
  const withTour = (value: TourContextValue) =>
    render(
      <TourContext.Provider value={value}>
        <RankTrustNote />
      </TourContext.Provider>,
    );

  it("shows once, and Got it records the id in the seen-set", () => {
    const value = ctx({});
    withTour(value);
    expect(screen.getByText(/Rank and trust are two things\./)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(value.markSeen).toHaveBeenCalledWith(RANK_TRUST_NOTE_ID);
  });

  it("stays hidden once seen, and until the seen-set is ready", () => {
    withTour(ctx({ hasSeen: (id: string) => id === RANK_TRUST_NOTE_ID }));
    expect(screen.queryByText(/Rank and trust/)).toBeNull();
    cleanup();
    withTour(ctx({ seenReady: false }));
    expect(screen.queryByText(/Rank and trust/)).toBeNull();
  });

  it("renders nothing outside the tour provider", () => {
    render(<RankTrustNote />);
    expect(screen.queryByText(/Rank and trust/)).toBeNull();
  });

  it("uses an id the server accepts", () => {
    expect(RANK_TRUST_NOTE_ID).toMatch(/^[a-z0-9][a-z0-9_-]{0,63}$/);
  });
});
