"use client";

/**
 * /directory — §G1/§G2 browse surface.
 *
 * Composes <DirectoryFilters> + <DirectoryGrid> on top of the
 * useDirectory hook. URL searchParams are the single source of truth
 * for filter state — the hook reads them on mount, filter changes
 * update them via router.replace, and a back-button traversal
 * restores the prior filter set.
 *
 * Why URL-state instead of component-state-only:
 *   - Sharable: `/directory?kind=validator&tier=legendary` is a real link
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
import { useEffect, useMemo, useRef, useState } from "react";

import { DirectoryFilters } from "@/components/directory/DirectoryFilters";
import { DirectoryGrid } from "@/components/directory/DirectoryGrid";
import { useDirectory, type DirectoryFilters as Filters } from "@/hooks/useDirectory";
import type {
  DirectoryKind,
  DirectorySort,
  DirectoryTier,
} from "@/lib/api/types";

const VALID_KINDS = new Set<DirectoryKind>(["validator", "project", "creator"]);
const VALID_TIERS = new Set<DirectoryTier>(["legendary", "rare", "uncommon", "common"]);
const VALID_SORTS = new Set<DirectorySort>(["trust", "newest", "endorsements", "followers"]);
const SEARCH_DEBOUNCE_MS = 300;

const DEFAULT_FILTERS: Filters = {
  kind: null,
  tier: null,
  sort: "trust",
  q: "",
  goodStandingOnly: false,
  chain: null,
};

export default function DirectoryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Build the canonical filter object from the current URL. This is
  // memoized on the searchParams identity so it's stable across renders
  // unless the URL actually changes.
  const filtersFromUrl = useMemo<Filters>(() => parseFilters(searchParams), [searchParams]);

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
      pushFiltersToUrl(router, filters);
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [filters, router]);

  const handleChange = (next: Filters) => {
    setFilters(next);
    // Synchronous write for non-search axes — the search box is the
    // only typing-driven control, so anything else means "the user
    // clicked a chip" and should land in the URL immediately.
    if (next.q === filters.q) {
      lastUrlQRef.current = next.q;
      pushFiltersToUrl(router, next);
    }
  };

  const handleClearAll = () => {
    setFilters(DEFAULT_FILTERS);
    lastUrlQRef.current = DEFAULT_FILTERS.q;
    pushFiltersToUrl(router, DEFAULT_FILTERS);
  };

  // Drive the query off the URL-derived filters (not the local state)
  // so a typing user doesn't burn API calls per keystroke. The local
  // state is just for input responsiveness.
  const query = useDirectory(filtersFromUrl);

  return (
    <main className="pb-24">
      <DirectoryRail />

      <header className="mx-auto max-w-[1560px] px-4 sm:px-7 pt-12">
        <p className="bcc-mono text-safety">FIND YOUR FLOOR</p>
        <h1
          className="bcc-stencil mt-3 text-cardstock leading-[0.95]"
          style={{ fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)" }}
        >
          Every operator on the floor.
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-cardstock-deep">
          Browse every validator, project, and creator graded on the floor.
          Filter by tier, search by name, sort by trust. Keep tabs on the
          ones you actually trust.
        </p>
      </header>

      <ActiveFiltersStrip filters={filters} onChange={handleChange} onClearAll={handleClearAll} />

      <div className="mx-auto mt-8 grid max-w-[1560px] grid-cols-1 gap-8 px-7 lg:grid-cols-[300px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <DirectoryFilters value={filters} onChange={handleChange} />
        </aside>

        <section>
          <DirectoryGrid query={query} />
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

function DirectoryRail() {
  return (
    <div className="border-b border-dashed border-cardstock/15">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-7 py-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; DIRECTORY</span>
        </span>
        <span className="bcc-mono text-cardstock/50">
          FILE INDEX &nbsp;//&nbsp; ALL OPERATORS
        </span>
      </div>
    </div>
  );
}

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
  const hasAny =
    filters.kind !== null ||
    filters.tier !== null ||
    filters.q !== "" ||
    filters.sort !== "trust" ||
    filters.goodStandingOnly ||
    filters.chain !== null;

  return (
    <div className="mt-10 border-y border-dashed border-cardstock/15">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-3 px-7 py-3">
        <span className="bcc-mono text-cardstock-deep">FILTER //</span>

        {!hasAny && (
          <span className="bcc-mono text-cardstock/50">SHOWING ALL</span>
        )}

        {filters.kind !== null && (
          <FilterChip
            label={filters.kind.toUpperCase()}
            onClear={() => onChange({ ...filters, kind: null })}
          />
        )}
        {filters.chain !== null && (
          <FilterChip
            label={`CHAIN · ${filters.chain.toUpperCase()}`}
            onClear={() => onChange({ ...filters, chain: null })}
          />
        )}
        {filters.tier !== null && (
          <FilterChip
            label={filters.tier.toUpperCase()}
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
            label={`SORT · ${filters.sort.toUpperCase()}`}
            onClear={() => onChange({ ...filters, sort: "trust" })}
          />
        )}

        {hasAny && (
          <button
            type="button"
            onClick={onClearAll}
            className="bcc-mono ml-auto text-safety hover:underline"
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
      className="bcc-mono inline-flex items-center gap-2 border border-cardstock/30 px-2 py-1 text-cardstock transition hover:border-safety hover:text-safety"
    >
      <span>{label}</span>
      <span aria-hidden className="text-cardstock-deep">✕</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// URL ↔ filters serialization
// ─────────────────────────────────────────────────────────────────────

function parseFilters(searchParams: URLSearchParams | null): Filters {
  if (searchParams === null) {
    return DEFAULT_FILTERS;
  }

  const kindRaw = searchParams.get("kind");
  const kind = kindRaw !== null && VALID_KINDS.has(kindRaw as DirectoryKind)
    ? (kindRaw as DirectoryKind)
    : null;

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

  // Chain slug — passed through verbatim. Server validates against
  // active chains and rejects unknown slugs at the endpoint boundary,
  // so a bogus URL param surfaces as an API error rather than silently
  // matching nothing.
  const chainRaw = searchParams.get("chain");
  const chain = chainRaw !== null && chainRaw !== "" ? chainRaw : null;

  return { kind, tier, sort, q, goodStandingOnly, chain };
}

function pushFiltersToUrl(
  router: ReturnType<typeof useRouter>,
  filters: Filters
): void {
  const params = new URLSearchParams();
  if (filters.kind !== null) params.set("kind", filters.kind);
  if (filters.tier !== null) params.set("tier", filters.tier);
  if (filters.sort !== "trust") params.set("sort", filters.sort);
  if (filters.q !== "") params.set("q", filters.q);
  if (filters.goodStandingOnly) params.set("good_standing", "1");
  if (filters.chain !== null) params.set("chain", filters.chain);

  const qs = params.toString();
  const url = (qs === "" ? "/directory" : `/directory?${qs}`) as Route;
  router.replace(url, { scroll: false });
}
