/**
 * Site Structure A, PR 1: Explore and Members ▸ Mentors routes.
 *
 *   1. The permanent forwards resolve exactly as intended, through Next's
 *      OWN matchers (path match, `has` match, destination + query), so
 *      the test sees what a request would. A 308 is cached by browsers
 *      and crawlers, so a wrong row here is hard to take back.
 *   2. Every forward lands on a route that exists, and the old route
 *      folders hold no page any more.
 *   3. The route tabs mark exactly the current route and are 44px tall.
 *   4. No in-app link still points at a moved route — the nav files
 *      included (Site Structure A, PR 3 rewrote the nav model and retired
 *      the exemption that waited on it).
 */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RouteMove } from "@/lib/route-moves";

/** The two functions Next's router uses to apply a redirect. Next ships
 *  no .d.ts for this module, so it is loaded untyped and given the slice
 *  of its signature this test calls. */
interface PrepareDestinationModule {
  matchHas(
    req: { headers: Record<string, string>; cookies: Record<string, string> },
    query: Record<string, string>,
    has: RouteMove["has"],
  ): false | Record<string, string>;
  prepareDestination(args: {
    appendParamsToQuery: boolean;
    destination: string;
    params: Record<string, unknown>;
    query: Record<string, string>;
  }): { parsedDestination: { pathname: string; query: Record<string, string | string[]> } };
}
const { matchHas, prepareDestination } = createRequire(import.meta.url)(
  "next/dist/shared/lib/router/utils/prepare-destination",
) as PrepareDestinationModule;

import { isScript, isTestFile, sourceFiles } from "@/app/source-tree.testing";

const pathname = vi.hoisted(() => ({ value: "/explore" }));
const search = vi.hoisted(() => ({ params: new URLSearchParams() }));
const nav = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.value,
  useSearchParams: () => search.params,
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() }),
}));
// Capture what the Explore tabs ask the data layer for; the grid itself
// is not under test.
const sent = vi.hoisted(() => ({ filters: [] as unknown[] }));
vi.mock("@/components/directory/DirectoryResults", () => ({
  DirectoryResults: ({ filters }: { filters: unknown }) => {
    sent.filters.push(filters);
    return null;
  },
}));
vi.mock("@/components/layout/RouteRail", () => ({ RouteRail: () => null }));

const { ROUTE_MOVES } = await import("@/lib/route-moves");
const { KindDirectoryPage } = await import("@/app/(main)/(app)/explore/KindDirectoryPage");
const { default: ExploreValidatorsPage } = await import("@/app/(main)/(app)/explore/page");
const { SectionTabs } = await import("@/components/ui/SectionTabs");
const { EXPLORE_TABS } = await import("@/app/(main)/(app)/explore/explore-tabs");
const { MEMBERS_TABS } = await import("@/app/(main)/(app)/members/members-tabs");

afterEach(cleanup);

const NO_HEADERS = { headers: {}, cookies: {} };

/** What Next would answer for GET `path?query`: the first matching move. */
function forward(path: string, query: Record<string, string> = {}) {
  for (const move of ROUTE_MOVES) {
    const params = getPathMatch(move.source)(path);
    if (params === false) continue;
    if (move.has !== undefined && matchHas(NO_HEADERS, query, move.has) === false) continue;
    const { parsedDestination } = prepareDestination({
      appendParamsToQuery: false,
      destination: move.destination,
      params,
      query,
    });
    return { to: parsedDestination.pathname, query: parsedDestination.query, permanent: move.permanent };
  }
  return null;
}

describe("1. the forwards", () => {
  it.each([
    ["/directory", { kind: "project" }, "/explore/projects"],
    ["/directory", { kind: "creator" }, "/explore/creators"],
    ["/directory", { kind: "validator" }, "/explore"],
    ["/directory", {}, "/explore"],
    // `has.value` is anchored: a near-miss falls through to the bare row.
    ["/directory", { kind: "projects" }, "/explore"],
    ["/validators", {}, "/explore"],
    ["/mentors", {}, "/members/mentors"],
  ] as const)("%s %j → %s", (path, query, to) => {
    expect(forward(path, { ...query })?.to).toBe(to);
  });

  it("keeps the filters of an old link (chain, q, page)", () => {
    expect(forward("/validators", { chain: "cosmos", q: "lion" })?.query).toEqual({ chain: "cosmos", q: "lion" });
    expect(forward("/directory", { kind: "project", tier: "trusted" })?.query).toMatchObject({ tier: "trusted" });
    expect(forward("/mentors", { page: "2" })?.query).toEqual({ page: "2" });
  });

  it("forwards only the moved paths, not their neighbours", () => {
    for (const path of ["/admin/validators", "/for-validators", "/validators/x", "/mentors/x", "/explore", "/members"]) {
      expect(forward(path), path).toBeNull();
    }
  });

  it("puts each `has` row above the bare row for the same source", () => {
    for (const [i, move] of ROUTE_MOVES.entries()) {
      if (move.has === undefined) continue;
      const bare = ROUTE_MOVES.findIndex((m) => m.source === move.source && m.has === undefined);
      expect(bare, `${move.source} has no bare row`).toBeGreaterThan(-1);
      expect(i, `${move.source} has-row below its bare row`).toBeLessThan(bare);
    }
  });

  it("is every row permanent, and the table is what next.config.ts serves", () => {
    for (const move of ROUTE_MOVES) expect(move.permanent).toBe(true);
    const config = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain('import { ROUTE_MOVES } from "./src/lib/route-moves";');
    expect(config).toContain("return [...ROUTE_MOVES];");
  });

  it("keeps the retired /settings space forwarding as before", () => {
    expect(forward("/settings/profile")?.to).toBe("/u/me");
    expect(forward("/settings/connections")?.to).toBe("/u/me");
  });
});

describe("2. destinations exist, old routes are gone", () => {
  const APP = resolve(process.cwd(), "src/app/(main)/(app)");

  it.each([
    ["/explore", "explore/page.tsx"],
    ["/explore/projects", "explore/projects/page.tsx"],
    ["/explore/creators", "explore/creators/page.tsx"],
    ["/members/mentors", "members/mentors/page.tsx"],
  ])("%s has a page", (_route, file) => {
    expect(existsSync(resolve(APP, file))).toBe(true);
  });

  it.each(["directory", "validators", "mentors"])("no page is left under /%s", (dir) => {
    expect(existsSync(resolve(APP, dir, "page.tsx"))).toBe(false);
    expect(existsSync(resolve(APP, dir, "layout.tsx"))).toBe(false);
  });
});

describe("3. route tabs", () => {
  it("marks exactly the current route, by exact match", () => {
    pathname.value = "/explore/projects";
    render(<SectionTabs label="Explore sections" tabs={EXPLORE_TABS} />);
    const nav = screen.getByRole("navigation", { name: "Explore sections" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["/explore", "/explore/projects", "/explore/creators"]);
    expect(links.map((a) => a.getAttribute("aria-current"))).toEqual([null, "page", null]);
    // Validators owns the bare /explore and is NOT active on a sibling.
    expect(within(nav).getByRole("link", { name: "Validators" })).not.toHaveAttribute("aria-current");
  });

  it("is a link strip, not a tablist, with 44px targets", () => {
    pathname.value = "/members";
    render(<SectionTabs label="Members sections" tabs={MEMBERS_TABS} />);
    expect(screen.queryByRole("tablist")).toBeNull();
    for (const link of screen.getAllByRole("link")) {
      expect(link.className).toContain("min-h-[44px]");
      expect(link.className).toContain("bcc-tab");
    }
    expect(screen.getByRole("link", { name: "Everyone" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Mentors" })).toHaveAttribute("href", "/members/mentors");
  });
});

describe("3a. Explore ▸ Validators honours tier", () => {
  // An old /directory?kind=validator&tier=… link forwards to /explore with
  // its query; the tier must still filter, and show as a removable chip.
  it("sends the tier, keeps the chain, and shows the tier chip", () => {
    pathname.value = "/explore";
    search.params = new URLSearchParams("kind=validator&tier=elite&chain=cosmos");
    sent.filters = [];
    render(<ExploreValidatorsPage />);
    expect(sent.filters.at(-1)).toMatchObject({ kind: "validator", tier: "elite", chain: "cosmos" });
    expect(screen.getByRole("button", { name: "Clear filter ELITE" })).toBeInTheDocument();
    // The tier chips are in the filter panel, shared with the other tabs.
    expect(screen.getByText("TIER")).toBeInTheDocument();
  });

  it("writes a tier picked in the panel to the URL", () => {
    pathname.value = "/explore";
    search.params = new URLSearchParams("chain=cosmos");
    nav.replace.mockClear();
    render(<ExploreValidatorsPage />);
    fireEvent.click(screen.getByRole("button", { name: "ELITE" }));
    expect(nav.replace).toHaveBeenLastCalledWith("/explore?chain=cosmos&tier=elite", { scroll: false });
  });

  it("drops an unknown tier rather than sending it", () => {
    pathname.value = "/explore";
    search.params = new URLSearchParams("tier=legendary");
    sent.filters = [];
    render(<ExploreValidatorsPage />);
    expect(sent.filters.at(-1)).toMatchObject({ tier: null });
  });
});

describe("3b. Projects and Creators ask for their own kind, and no chain", () => {
  // What an old /directory?kind=validator&chain=…&tier=… link carries
  // through the forward. The route decides the kind; `chain` is a
  // validator-only server filter (empty for other kinds), so it is dropped.
  it.each([
    ["project", "/explore/projects"],
    ["creator", "/explore/creators"],
  ] as const)("%s", (kind, path) => {
    pathname.value = path;
    search.params = new URLSearchParams("kind=validator&chain=cosmos&tier=trusted");
    sent.filters = [];
    render(<KindDirectoryPage kind={kind} />);
    expect(sent.filters.at(-1)).toMatchObject({ kind, chain: null, tier: "trusted" });
    expect(screen.getByRole("link", { name: kind === "project" ? "Projects" : "Creators" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
});

describe("4. no in-app link to a moved route", () => {
  // A quote, backtick or paren, the old path, then a delimiter or the end.
  const OLD = /["'`(]\/(directory|validators|mentors)(?=["'`?/#)]|$)/m;

  const files = sourceFiles().filter(
    (f) => isScript(f.rel) && !isTestFile(f.rel) && f.rel !== "lib/route-moves.ts",
  );

  it("scans a real tree", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it("finds none", () => {
    const hits = files.flatMap((f) =>
      f.code
        .split(/\r?\n/)
        .map((line, i) => ({ line, at: `${f.rel}:${i + 1}` }))
        .filter(({ line }) => OLD.test(line) && !/\/(admin|me)\/validators|bcc\/v1/.test(line))
        .map(({ at, line }) => `${at}  ${line.trim()}`),
    );
    expect(hits).toEqual([]);
  });

  it("scans every nav file, with no exemption left", () => {
    const scanned = new Set(files.map((f) => f.rel));
    for (const rel of [
      "components/layout/nav-items.tsx",
      "components/layout/nav/MobileNav.tsx",
      "components/layout/LeftSidebar.tsx",
      "components/layout/offcanvas/MainOffcanvas.tsx",
      "components/layout/SiteHeader.tsx",
    ]) {
      expect(scanned.has(rel), rel).toBe(true);
    }
  });
});
