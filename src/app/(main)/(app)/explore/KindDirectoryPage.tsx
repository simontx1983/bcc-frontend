"use client";

/**
 * Explore ▸ Projects (/explore/projects) and Explore ▸ Creators
 * (/explore/creators) — the §G1/§G2 browse surface, one kind per route.
 *
 * This is the former /directory page, moved (Site Structure A). The kind
 * used to be a filter chip; now the route fixes it (a `kind` prop), so it
 * is never read from or written to the URL. Old /directory?kind=… links
 * forward to the matching tab (src/lib/route-moves.ts). The validator
 * kind has its own page (/explore) because it carries extra on-chain
 * filters.
 *
 * Composes <DirectoryFilters> + <DirectoryGrid> on top of the
 * useDirectory hook. URL searchParams are the single source of truth
 * for filter state — the hook reads them on mount, filter changes
 * update them via router.replace, and a back-button traversal
 * restores the prior filter set.
 *
 * Why URL-state instead of component-state-only:
 *   - Sharable: `/explore/projects?tier=trusted` is a real link
 *   - Back-button friendly: filter changes are history entries the user
 *     can rewind through
 *   - SSR-friendly later: a future server-rendered variant can read
 *     the same params without translation
 *
 * The search input is debounced (~300ms) so typing doesn't spam the
 * URL and the React Query cache. Chip / sort changes apply immediately.
 *
 * Layout: top FileRail + safety-orange-kicker hero + active-filter
 * strip (what's currently applied + CLEAR ALL) above the 2-column
 * filter-sidebar / card-grid layout. Same "FILE NN //" rhythm as
 * /u/[handle] so the directory and profile feel like the same product.
 *
 * Currently a fully client component — the directory is interactive
 * in nature (filter chips, infinite-scroll). A future `loading.tsx`
 * + server-shell split could pre-render the first page for SEO; that
 * lives in V1.5.
 */

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";

import { RouteRail } from "@/components/layout/RouteRail";
import {
  DirectoryFilters,
  SORT_OPTIONS,
  TIER_OPTIONS,
  filterOptionLabel,
} from "@/components/directory/DirectoryFilters";
import { DirectoryResults } from "@/components/directory/DirectoryResults";
import { SectionTabs } from "@/components/ui/SectionTabs";
import type { DirectoryFilters as Filters } from "@/hooks/useDirectory";
import type {
  DirectoryKind,
  DirectorySort,
  DirectoryTier,
} from "@/lib/api/types";

import { EXPLORE_TABS } from "./explore-tabs";

/** The kinds this page serves; validators have their own page (/explore). */
export type ExploreKind = Extract<DirectoryKind, "project" | "creator">;

const KIND_PAGE: Record<ExploreKind, { path: string; label: string; title: string; lede: string }> = {
  project: {
    path: "/explore/projects",
    label: "FILE INDEX \u00a0//\u00a0 ALL PROJECTS",
    title: "Every project on the floor.",
    lede: "Browse the projects graded on the floor. Filter by tier, search by name, sort by trust. Keep tabs on the ones you actually trust.",
  },
  creator: {
    path: "/explore/creators",
    label: "FILE INDEX \u00a0//\u00a0 ALL CREATORS",
    title: "Every creator on the floor.",
    lede: "Browse the creators graded on the floor. Filter by tier, search by name, sort by trust. Keep tabs on the ones you actually trust.",
  },
};

const VALID_TIERS = new Set<DirectoryTier>(["elite", "trusted", "neutral", "caution", "risky"]);
const VALID_SORTS = new Set<DirectorySort>(["trust", "newest", "endorsements", "followers"]);
const SEARCH_DEBOUNCE_MS = 300;

function defaultFilters(kind: ExploreKind): Filters {
  return {
    kind,
    tier: null,
    sort: "trust",
    q: "",
    goodStandingOnly: false,
    chain: null,
  };
}

function DirectoryPageContent({ kind }: { kind: ExploreKind }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const page = KIND_PAGE[kind];

  // Build the canonical filter object from the current URL. This is
  // memoized on the searchParams identity so it's stable across renders
  // unless the URL actually changes.
  const filtersFromUrl = useMemo<Filters>(() => parseFilters(searchParams, kind), [searchParams, kind]);

  // Local filter state mirrors the URL but allows the search box to
  // stay responsive while debouncing the URL update. Chip / sort
  // changes write to BOTH local + URL synchronously so the grid
  // reflects them on the next render.
  const [filters, setFilters] = useState<Filters>(filtersFromUrl);

  // When the URL changes externally (back button, link), pull the
  // values back into local state.
  useEffect(() => {
    setFilters(filtersFromUrl);
  }, [filtersFromUrl]);

  // Debounce the search-string portion of the local filters into
  // the URL. Other filter axes (kind/tier/sort) write the URL
  // synchronously inside handleChange.
  const lastUrlQRef = useRef<string>(filtersFromUrl.q);
  useEffect(() => {
    if (filters.q === lastUrlQRef.current) {
      return;
    }
    const t = window.setTimeout(() => {
      lastUrlQRef.current = filters.q;
      pushFiltersToUrl(router, filters, kind);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [filters, router, kind]);

  const handleChange = (next: Filters) => {
    setFilters(next);
    // Synchronous write for non-search axes — the search box is the
    // only typing-driven control, so anything else means "the user
    // clicked a chip" and should land in the URL immediately.
    if (next.q === filters.q) {
      lastUrlQRef.current = next.q;
      pushFiltersToUrl(router, next, kind);
    }
  };

  const handleClearAll = () => {
    const cleared = defaultFilters(kind);
    setFilters(cleared);
    lastUrlQRef.current = cleared.q;
    pushFiltersToUrl(router, cleared, kind);
  };

  // Drive the query off the URL-derived filters (not the local state)
  // so a typing user doesn't burn API calls per keystroke. The local
  // state is just for input responsiveness.

  return (
    <main className="bcc-page-wide pb-24">
      <RouteRail kicker={"FLOOR \u00a0//\u00a0 EXPLORE"} label={page.label} />

      <header className="mx-auto max-w-[1560px] px-4 sm:px-7 pt-12">
        <p className="bcc-mono text-bcc-text-safety">FIND YOUR FLOOR</p>
        <h1
          className="bcc-stencil mt-3 text-bcc-text leading-[0.95]"
          style={{ fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)" }}
        >
          {page.title}
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-bcc-text-secondary">
          {page.lede}
        </p>
      </header>

      <SectionTabs label="Explore sections" tabs={EXPLORE_TABS} />

      <ActiveFiltersStrip filters={filters} onChange={handleChange} onClearAll={handleClearAll} />

      <div className="mx-auto mt-8 grid max-w-[1560px] grid-cols-1 gap-8 px-7 lg:grid-cols-[300px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <DirectoryFilters value={filters} onChange={handleChange} />
        </aside>

        <section>
          <DirectoryResults filters={filtersFromUrl} />
        </section>
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// DirectoryRail — top status strip in the same vocabulary as the
// SiteHeader rail and the /u/[handle] FileRail. Anchors the page in
// the "we're flipping through a file index" metaphor.
// ──────────────────────────────────────────────────────────────────────

// ──────────────────────────────────────────────────────────────────────
// ActiveFiltersStrip — surfaces what's currently applied above the
// grid. When nothing is filtered shows "SHOWING ALL"; otherwise renders
// removable chips per axis + a CLEAR ALL action. Saves the user a trip
// to the sidebar to figure out why their results look limited.
// ──────────────────────────────────────────────────────────────────────

function ActiveFiltersStrip({
  filters,
  onChange,
  onClearAll,
}: {
  filters: Filters;
  onChange: (next: Filters) => void;
  onClearAll: () => void;
}) {
  // `kind` is fixed by the route, so it is never a removable filter here.
  const hasAny =
    filters.tier !== null ||
    filters.q !== "" ||
    filters.sort !== "trust" ||
    filters.goodStandingOnly;

  return (
    <div className="mt-10 border-y border-dashed border-bcc-border">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-3 px-7 py-3">
        <span className="bcc-mono text-bcc-text-secondary">FILTER //</span>

        {!hasAny && (
          <span className="bcc-mono text-bcc-text-secondary">SHOWING ALL</span>
        )}

        {filters.tier !== null && (
          <FilterChip
            label={filterOptionLabel(TIER_OPTIONS, filters.tier).toUpperCase()}
            onClear={() => onChange({ ...filters, tier: null })}
          />
        )}
        {filters.goodStandingOnly && (
          <FilterChip
            label="GOOD STANDING ONLY"
            onClear={() => onChange({ ...filters, goodStandingOnly: false })}
          />
        )}
        {filters.q !== "" && (
          <FilterChip
            label={`"${filters.q}"`}
            onClear={() => onChange({ ...filters, q: "" })}
          />
        )}
        {filters.sort !== "trust" && (
          <FilterChip
            label={`SORT · ${filterOptionLabel(SORT_OPTIONS, filters.sort).toUpperCase()}`}
            onClear={() => onChange({ ...filters, sort: "trust" })}
          />
        )}

        {hasAny && (
          <button
            type="button"
            onClick={onClearAll}
            className="bcc-mono ml-auto text-bcc-text-safety hover:underline"
          >
            CLEAR ALL
          </button>
        )}
      </div>
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      type="button"
      onClick={onClear}
      aria-label={`Clear filter ${label}`}
      className="bcc-mono inline-flex items-center gap-2 border border-bcc-border px-2 py-1 text-bcc-text-secondary transition hover:border-safety hover:text-bcc-text-safety"
    >
      <span>{label}</span>
      <span aria-hidden className="text-bcc-text-muted">✕</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// URL ↔ filters serialization
// ─────────────────────────────────────────────────────────────────────

function parseFilters(searchParams: URLSearchParams | null, kind: ExploreKind): Filters {
  if (searchParams === null) {
    return defaultFilters(kind);
  }

  // A `kind` param (an old /directory?kind=… link carried through the
  // forward) is ignored: the route decides the kind.

  const tierRaw = searchParams.get("tier");
  const tier = tierRaw !== null && VALID_TIERS.has(tierRaw as DirectoryTier)
    ? (tierRaw as DirectoryTier)
    : null;

  const sortRaw = searchParams.get("sort");
  const sort = sortRaw !== null && VALID_SORTS.has(sortRaw as DirectorySort)
    ? (sortRaw as DirectorySort)
    : "trust";

  const q = searchParams.get("q") ?? "";

  const goodStandingOnly = searchParams.get("good_standing") === "1";

  // No chain axis: the server's `chain` filter is validator-only (empty
  // for other kinds), so a `chain` param from an old link is dropped
  // rather than sent.
  return { kind, tier, sort, q, goodStandingOnly, chain: null };
}

function pushFiltersToUrl(
  router: ReturnType<typeof useRouter>,
  filters: Filters,
  kind: ExploreKind,
): void {
  const params = new URLSearchParams();
  if (filters.tier !== null) params.set("tier", filters.tier);
  if (filters.sort !== "trust") params.set("sort", filters.sort);
  if (filters.q !== "") params.set("q", filters.q);
  if (filters.goodStandingOnly) params.set("good_standing", "1");

  const qs = params.toString();
  const path = KIND_PAGE[kind].path;
  const url = (qs === "" ? path : `${path}?${qs}`) as Route;
  router.replace(url, { scroll: false });
}

export function KindDirectoryPage({ kind }: { kind: ExploreKind }) {
  return (
    <Suspense>
      <DirectoryPageContent kind={kind} />
    </Suspense>
  );
}
