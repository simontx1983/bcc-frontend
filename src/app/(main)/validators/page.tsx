"use client";

/**
 * /validators — dedicated browse surface for validators.
 *
 * Promoted from a bare redirect to /directory?kind=validator. The shared
 * /directory is polymorphic across validator/project/creator, so its
 * filter set is the lowest common denominator. Validators carry an
 * on-chain signal set (status, self-stake, …) the shared directory can't
 * filter on — this page exposes those validator-only axes.
 *
 * It reuses the directory's data layer wholesale: the same useDirectory
 * hook (with `kind` locked to "validator") and DirectoryGrid. The only
 * validator-specific pieces are <ValidatorFilters> and the URL surface
 * here, which adds `status` + `min_self_stake` on top of the shared
 * chain/tier/sort/search/good-standing axes.
 *
 * URL searchParams are the single source of truth (sharable +
 * back-button navigable), mirroring /directory. `kind` is NOT in the URL
 * — it's implied by the route and always sent as "validator".
 */

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";

import { ValidatorFilters } from "@/components/directory/ValidatorFilters";
import { DirectoryGrid } from "@/components/directory/DirectoryGrid";
import { useDirectory, type DirectoryFilters as Filters } from "@/hooks/useDirectory";
import type {
  DirectorySort,
  ValidatorStatusFilter,
} from "@/lib/api/types";

// `self_stake` IS offered here (unlike the shared directory) — every row
// is a validator, so the validator-only sort is always meaningful.
const VALID_SORTS = new Set<DirectorySort>([
  "trust",
  "newest",
  "endorsements",
  "followers",
  "self_stake",
]);
const VALID_STATUSES = new Set<ValidatorStatusFilter>(["active", "jailed", "inactive"]);
const SEARCH_DEBOUNCE_MS = 300;

const DEFAULT_FILTERS: Filters = {
  kind: "validator",
  // tier / goodStandingOnly are part of the shared filter shape but are
  // not exposed on /validators — they stay at their inert defaults here.
  tier: null,
  sort: "trust",
  q: "",
  goodStandingOnly: false,
  chain: null,
  status: null,
};

function ValidatorsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filtersFromUrl = useMemo<Filters>(() => parseFilters(searchParams), [searchParams]);

  // Local filter state mirrors the URL but lets the search box stay
  // responsive while the URL update is debounced. Non-search axes write
  // the URL synchronously inside handleChange.
  const [filters, setFilters] = useState<Filters>(filtersFromUrl);

  useEffect(() => {
    setFilters(filtersFromUrl);
  }, [filtersFromUrl]);

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

  // Drive the query off URL-derived filters so a typing user doesn't burn
  // API calls per keystroke. `kind` is always "validator" here.
  const query = useDirectory(filtersFromUrl);

  return (
    <main className="pb-24">
      <ValidatorsRail />

      <header className="mx-auto max-w-[1560px] px-4 sm:px-7 pt-12">
        <p className="bcc-mono text-safety">KNOW YOUR VALIDATOR</p>
        <h1
          className="bcc-stencil mt-3 text-cardstock leading-[0.95]"
          style={{ fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)" }}
        >
          Every validator on the floor.
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-cardstock-deep">
          Browse validators graded on the floor. Filter by chain, on-chain
          status, and bonded self-stake; sort by trust or skin-in-the-game.
          Keep tabs on the operators you actually trust to secure the chain.
        </p>
      </header>

      <ActiveFiltersStrip filters={filters} onChange={handleChange} onClearAll={handleClearAll} />

      <div className="mx-auto mt-8 grid max-w-[1560px] grid-cols-1 gap-8 px-7 lg:grid-cols-[300px_1fr]">
        {/* The <aside> stretches to the grid-row height; the INNER wrapper
            is the sticky element. (Sticky on the grid item itself is
            ignored by the browser — it must be a normal block child.) Its
            top clears the fixed header (--bcc-header-h) plus the compact,
            single-line ActiveFiltersStrip, so the panel's SEARCH field is
            never hidden behind the strip when the grid is scrolled. */}
        <aside>
          <div className="lg:sticky lg:top-[calc(var(--bcc-header-h)+4rem)]">
            <ValidatorFilters value={filters} onChange={handleChange} />
          </div>
        </aside>

        <section>
          <DirectoryGrid query={query} />
        </section>
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// ValidatorsRail — top status strip in the same vocabulary as the
// SiteHeader rail and the /directory FileRail.
// ──────────────────────────────────────────────────────────────────────

function ValidatorsRail() {
  return (
    <div className="border-b border-dashed border-cardstock/15">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-7 py-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; VALIDATORS</span>
        </span>
        <span className="bcc-mono text-cardstock/50">
          FILE INDEX &nbsp;//&nbsp; STAKING OPERATORS
        </span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// ActiveFiltersStrip — surfaces what's currently applied above the grid.
// `kind` is omitted (always validator here, so it isn't a removable
// filter). Exposed axes: chain, status, search, sort.
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
    filters.q !== "" ||
    filters.sort !== "trust" ||
    filters.chain !== null ||
    (filters.status ?? null) !== null;

  return (
    // Sticky so CLEAR ALL stays reachable without scrolling back to the
    // top. Anchors to the .bcc-col-center scroll container; top parks it
    // just under the fixed SiteHeader (z-200), and the opaque page-bg
    // keeps scrolling cards from bleeding through. Kept to a SINGLE line
    // (chips scroll horizontally, CLEAR ALL pinned) so the sticky band
    // stays short — a wrapping multi-row band would swallow the filter
    // panel's SEARCH field on short result sets.
    <div className="sticky top-[var(--bcc-header-h)] z-10 mt-10 border-y border-dashed border-cardstock/15 bg-[var(--bcc-bg)]">
      <div className="mx-auto flex max-w-[1560px] items-center gap-3 px-7 py-3">
        <span className="bcc-mono shrink-0 text-cardstock-deep">FILTER //</span>

        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {!hasAny && (
            <span className="bcc-mono shrink-0 text-cardstock/50">SHOWING ALL</span>
          )}

          {filters.chain !== null && (
            <FilterChip
              label={`CHAIN · ${filters.chain.toUpperCase()}`}
              onClear={() => onChange({ ...filters, chain: null })}
            />
          )}
          {(filters.status ?? null) !== null && (
            <FilterChip
              label={`STATUS · ${(filters.status as string).toUpperCase()}`}
              onClear={() => onChange({ ...filters, status: null })}
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
        </div>

        {hasAny && (
          <button
            type="button"
            onClick={onClearAll}
            className="bcc-mono shrink-0 text-safety hover:underline"
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
      className="bcc-mono inline-flex shrink-0 items-center gap-2 whitespace-nowrap border border-cardstock/30 px-2 py-1 text-cardstock transition hover:border-safety hover:text-safety"
    >
      <span>{label}</span>
      <span aria-hidden className="text-cardstock-deep">✕</span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// URL ↔ filters serialization. `kind` is never serialized — it's fixed
// to "validator" by the route.
// ─────────────────────────────────────────────────────────────────────

function parseFilters(searchParams: URLSearchParams | null): Filters {
  if (searchParams === null) {
    return DEFAULT_FILTERS;
  }

  const sortRaw = searchParams.get("sort");
  const sort = sortRaw !== null && VALID_SORTS.has(sortRaw as DirectorySort)
    ? (sortRaw as DirectorySort)
    : "trust";

  const q = searchParams.get("q") ?? "";

  const chainRaw = searchParams.get("chain");
  const chain = chainRaw !== null && chainRaw !== "" ? chainRaw : null;

  const statusRaw = searchParams.get("status");
  const status = statusRaw !== null && VALID_STATUSES.has(statusRaw as ValidatorStatusFilter)
    ? (statusRaw as ValidatorStatusFilter)
    : null;

  // tier / goodStandingOnly are not exposed on /validators — held inert.
  return { kind: "validator", tier: null, sort, q, goodStandingOnly: false, chain, status };
}

function pushFiltersToUrl(
  router: ReturnType<typeof useRouter>,
  filters: Filters
): void {
  const params = new URLSearchParams();
  if (filters.sort !== "trust") params.set("sort", filters.sort);
  if (filters.q !== "") params.set("q", filters.q);
  if (filters.chain !== null) params.set("chain", filters.chain);
  if ((filters.status ?? null) !== null) params.set("status", filters.status as string);

  const qs = params.toString();
  const url = (qs === "" ? "/validators" : `/validators?${qs}`) as Route;
  router.replace(url, { scroll: false });
}

export default function ValidatorsPage() {
  return (
    <Suspense>
      <ValidatorsPageContent />
    </Suspense>
  );
}
