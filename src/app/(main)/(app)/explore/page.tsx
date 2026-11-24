"use client";

/**
 * /explore — Explore ▸ Validators, the front door of Explore (Site
 * Structure A). This is the former /validators page, moved; /validators
 * and a bare /directory forward here (src/lib/route-moves.ts). Projects
 * and Creators are sibling routes (./projects, ./creators).
 *
 * Validators carry an on-chain signal set (status, self-stake, …) the
 * other kinds don't, so this tab exposes those validator-only axes.
 *
 * It reuses the directory's data layer wholesale: the same useDirectory
 * hook (with `kind` locked to "validator") and DirectoryGrid. The only
 * validator-specific pieces are <ValidatorFilters> and the URL surface
 * here, which adds `status` + `min_self_stake` on top of the shared
 * chain/tier/sort/search/good-standing axes.
 *
 * URL searchParams are the single source of truth (sharable +
 * back-button navigable), mirroring the Projects and Creators tabs.
 * `kind` is NOT in the URL — it's implied by the route and always sent
 * as "validator".
 */

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";

import { RouteRail } from "@/components/layout/RouteRail";
import { SectionHeader } from "@/components/layout/SectionHeader";
import { TIER_OPTIONS, filterOptionLabel } from "@/components/directory/DirectoryFilters";
import { SORT_OPTIONS, STATUS_OPTIONS, ValidatorFilters } from "@/components/directory/ValidatorFilters";
import { DirectoryResults } from "@/components/directory/DirectoryResults";
import { SectionTabs } from "@/components/ui/SectionTabs";
import type { DirectoryFilters as Filters } from "@/hooks/useDirectory";
import type {
  DirectorySort,
  DirectoryTier,
  ValidatorStatusFilter,
} from "@/lib/api/types";

import { EXPLORE_SECTION, EXPLORE_TABS } from "./explore-tabs";

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
const VALID_TIERS = new Set<DirectoryTier>(["elite", "trusted", "neutral", "caution", "risky"]);
const SEARCH_DEBOUNCE_MS = 300;

const DEFAULT_FILTERS: Filters = {
  kind: "validator",
  tier: null,
  // goodStandingOnly is part of the shared filter shape but is not
  // exposed on this tab — it stays at its inert default here.
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

  return (
    <main className="bcc-page-wide pb-24">
      <RouteRail kicker={"FLOOR \u00a0//\u00a0 EXPLORE"} label={"FILE INDEX \u00a0//\u00a0 ALL VALIDATORS"} />

      <SectionHeader
        eyebrow={EXPLORE_SECTION.eyebrow}
        title={EXPLORE_SECTION.title}
        lede={EXPLORE_SECTION.lede}
      />

      <SectionTabs label="Explore sections" tabs={EXPLORE_TABS} />

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
          <DirectoryResults filters={filtersFromUrl} />
        </section>
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// ValidatorsRail — top status strip in the same vocabulary as the
// SiteHeader rail and the Explore tabs' FileRail.
// ──────────────────────────────────────────────────────────────────────

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
    filters.tier !== null ||
    (filters.status ?? null) !== null;

  return (
    // Sticky so CLEAR ALL stays reachable without scrolling back to the
    // top. Anchors to the .bcc-col-center scroll container; top parks it
    // just under the fixed SiteHeader (z-200), and the opaque page-bg
    // keeps scrolling cards from bleeding through. Kept to a SINGLE line
    // (chips scroll horizontally, CLEAR ALL pinned) so the sticky band
    // stays short — a wrapping multi-row band would swallow the filter
    // panel's SEARCH field on short result sets.
    <div className="sticky top-[var(--bcc-header-h)] z-10 mt-10 border-y border-dashed border-bcc-border bg-[var(--bcc-bg)]">
      <div className="mx-auto flex max-w-[1560px] items-center gap-3 px-7 py-3">
        <span className="bcc-mono shrink-0 text-bcc-text-secondary">FILTER //</span>

        <div className="flex min-w-0 flex-1 items-center gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {!hasAny && (
            <span className="bcc-mono shrink-0 text-bcc-text-secondary">SHOWING ALL</span>
          )}

          {filters.chain !== null && (
            <FilterChip
              label={`CHAIN · ${filters.chain.toUpperCase()}`}
              onClear={() => onChange({ ...filters, chain: null })}
            />
          )}
          {filters.status !== undefined && filters.status !== null && (
            <FilterChip
              label={`STATUS · ${filterOptionLabel(STATUS_OPTIONS, filters.status).toUpperCase()}`}
              onClear={() => onChange({ ...filters, status: null })}
            />
          )}
          {filters.tier !== null && (
            <FilterChip
              label={filterOptionLabel(TIER_OPTIONS, filters.tier).toUpperCase()}
              onClear={() => onChange({ ...filters, tier: null })}
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
        </div>

        {hasAny && (
          <button
            type="button"
            onClick={onClearAll}
            className="bcc-mono shrink-0 text-bcc-text-safety hover:underline"
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
      className="bcc-mono inline-flex shrink-0 items-center gap-2 whitespace-nowrap border border-bcc-border px-2 py-1 text-bcc-text-secondary transition hover:border-safety hover:text-bcc-text-safety"
    >
      <span>{label}</span>
      <span aria-hidden className="text-bcc-text-muted">✕</span>
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

  // Tier is honoured on every Explore tab, so an old
  // /directory?kind=validator&tier=… link keeps its filter after the
  // forward. An unknown value is dropped rather than sent.
  const tierRaw = searchParams.get("tier");
  const tier = tierRaw !== null && VALID_TIERS.has(tierRaw as DirectoryTier)
    ? (tierRaw as DirectoryTier)
    : null;

  // goodStandingOnly is not exposed on this tab — held inert.
  return { kind: "validator", tier, sort, q, goodStandingOnly: false, chain, status };
}

function pushFiltersToUrl(
  router: ReturnType<typeof useRouter>,
  filters: Filters
): void {
  const params = new URLSearchParams();
  if (filters.sort !== "trust") params.set("sort", filters.sort);
  if (filters.q !== "") params.set("q", filters.q);
  if (filters.chain !== null) params.set("chain", filters.chain);
  if (filters.tier !== null) params.set("tier", filters.tier);
  if ((filters.status ?? null) !== null) params.set("status", filters.status as string);

  const qs = params.toString();
  const url = (qs === "" ? "/explore" : `/explore?${qs}`) as Route;
  router.replace(url, { scroll: false });
}

export default function ValidatorsPage() {
  return (
    <Suspense>
      <ValidatorsPageContent />
    </Suspense>
  );
}
