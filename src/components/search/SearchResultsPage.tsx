"use client";

/**
 * SearchResultsPage — /search top-level surface.
 *
 * Two states:
 *   - With `?q=…`: 4-tab multi-vertical results (All / Projects / Users
 *     / Groups). Tab state lives in URL (`?tab=…`) so refresh and deep
 *     links work — same pattern as
 *     [DisputesRoom](../disputes/DisputesRoom.tsx).
 *   - Without a query: landing state shows the trending list as a
 *     single panel (no tabs) so the page never feels empty.
 *
 * Hooks fire in parallel on mount, so switching tabs is instant after
 * the first paint (React Query cache hit). The "All" tab is composed
 * client-side from the three vertical queries — one less network
 * request than calling cards/search separately, and the row shapes
 * carry more fields than SearchSuggestion (tier, description, etc.)
 * which the wider page-level cards need.
 *
 * Reduced motion: tab transitions use the `motion-safe:` variant
 * (matches the codebase convention at FeedTabs and elsewhere).
 */

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";

import {
  GroupRow,
  ProjectRow,
  SearchResultsTab,
  UserRow,
} from "@/components/search/SearchResultsTab";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import { useSearchGroups } from "@/hooks/useSearchGroups";
import { useSearchProjects } from "@/hooks/useSearchProjects";
import { useSearchUsers } from "@/hooks/useSearchUsers";
import { useTrendingSearches } from "@/hooks/useTrendingSearches";
import type {
  GroupSearchResult,
  ProjectSearchResult,
  UserSearchResult,
} from "@/lib/api/types";

type TabKey = "all" | "projects" | "users" | "groups";
const VALID_TABS: readonly TabKey[] = [
  "all",
  "projects",
  "users",
  "groups",
] as const;
const DEFAULT_TAB: TabKey = "all";

interface SearchResultsPageProps {
  query: string;
}

export function SearchResultsPage({ query }: SearchResultsPageProps) {
  const trimmed = query.trim();
  const hasQuery = trimmed.length > 0;

  if (!hasQuery) return <TrendingLanding />;
  return <ResultsView query={trimmed} />;
}

// ─────────────────────────────────────────────────────────────────────
// Query-driven view
// ─────────────────────────────────────────────────────────────────────

function ResultsView({ query }: { query: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tab: TabKey = useMemo(() => {
    const raw = searchParams.get("tab");
    return VALID_TABS.includes(raw as TabKey) ? (raw as TabKey) : DEFAULT_TAB;
  }, [searchParams]);

  const setTab = (next: TabKey): void => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_TAB) {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const qs = params.toString();
    router.replace((qs !== "" ? `/search?${qs}` : "/search") as Route, {
      scroll: false,
    });
  };

  // Category filter for the Projects tab, held in the URL (`?type=`) the
  // same way `?tab=` is. Only applied when the Projects tab is active — the
  // All tab stays an unfiltered overview.
  const rawType = searchParams.get("type");
  const setType = (next: string | null): void => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === null) {
      params.delete("type");
    } else {
      params.set("type", next);
    }
    const qs = params.toString();
    router.replace((qs !== "" ? `/search?${qs}` : "/search") as Route, {
      scroll: false,
    });
  };

  // Fire all three verticals in parallel. The currently-inactive tabs'
  // queries warm the React Query cache so tab-switch is instant.
  // The projects query is only type-filtered while the Projects tab is
  // active, so the All tab and the other verticals are never narrowed.
  const projectsType = tab === "projects" && rawType !== null ? rawType : null;
  const projects = useSearchProjects(
    query,
    projectsType !== null ? { type: projectsType } : {},
  );
  const users = useSearchUsers(query);
  const groups = useSearchGroups(query);

  // Canonical category list comes from the projects response (always the
  // full set for a valid/absent type). A `?type=` that isn't a live
  // category slug is treated as "All" so a stale/hand-edited link can't
  // strand the user on an empty, unrecoverable filtered view.
  const categories = projects.data?.categories ?? [];
  const selectedType =
    rawType !== null && categories.some((c) => c.slug === rawType)
      ? rawType
      : null;

  const counts = {
    all:
      (projects.data?.results?.length ?? 0) +
      (users.data?.results?.length ?? 0) +
      (groups.data?.results?.length ?? 0),
    projects: projects.data?.results?.length ?? 0,
    users: users.data?.results?.length ?? 0,
    groups: groups.data?.results?.length ?? 0,
  };
  const anyLoading = projects.isLoading || users.isLoading || groups.isLoading;

  return (
    <section>
      <header className="border-b border-dashed border-cardstock/15 pb-3">
        <p className="bcc-mono text-cardstock-deep">
          RESULTS FOR &ldquo;
          <span className="text-ink">{query}</span>
          &rdquo;
        </p>
      </header>

      <TabBar tab={tab} setTab={setTab} counts={counts} loading={anyLoading} />

      {tab === "projects" && (
        <div className="mt-6">
          <FilterChipRow<string | null>
            label="Category"
            options={[
              { value: null, label: "All" },
              ...categories.map((c) => ({ value: c.slug, label: c.name })),
            ]}
            selected={selectedType}
            onSelect={setType}
          />
        </div>
      )}

      <div className="mt-6">
        {tab === "all" && (
          <AllTab
            query={query}
            projects={projects.data?.results ?? []}
            users={users.data?.results ?? []}
            groups={groups.data?.results ?? []}
            isLoading={anyLoading}
            isError={projects.isError && users.isError && groups.isError}
          />
        )}
        {tab === "projects" && (
          <SearchResultsTab
            kind="projects"
            query={query}
            results={projects.data?.results ?? []}
            isLoading={projects.isLoading}
            isError={projects.isError}
          />
        )}
        {tab === "users" && (
          <SearchResultsTab
            kind="users"
            query={query}
            results={users.data?.results ?? []}
            isLoading={users.isLoading}
            isError={users.isError}
          />
        )}
        {tab === "groups" && (
          <SearchResultsTab
            kind="groups"
            query={query}
            results={groups.data?.results ?? []}
            isLoading={groups.isLoading}
            isError={groups.isError}
          />
        )}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TabBar — mirrors FeedTabs styling (bcc-stencil + border-b-2 +
// safety/transparent underline) with optional result counts. Counts
// only render once at least one vertical has resolved, so the chrome
// doesn't flicker during the initial skeleton.
// ─────────────────────────────────────────────────────────────────────

interface TabBarProps {
  tab: TabKey;
  setTab: (next: TabKey) => void;
  counts: Record<TabKey, number>;
  loading: boolean;
}

const TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "projects", label: "Projects" },
  { key: "users", label: "Users" },
  { key: "groups", label: "Groups" },
];

function TabBar({ tab, setTab, counts, loading }: TabBarProps) {
  return (
    <nav
      role="tablist"
      aria-label="Search verticals"
      className="mt-6 flex items-center gap-1 overflow-x-auto border-b border-cardstock-edge/30"
    >
      {TABS.map(({ key, label }) => {
        const isActive = key === tab;
        const count = counts[key];
        return (
          <button
            key={key}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => setTab(key)}
            className={
              isActive
                ? "bcc-stencil whitespace-nowrap border-b-2 border-safety px-2 py-2.5 text-[11px] text-cardstock sm:px-4 sm:text-sm motion-safe:transition-colors motion-safe:duration-bcc-fast"
                : "bcc-stencil whitespace-nowrap border-b-2 border-transparent px-2 py-2.5 text-[11px] text-cardstock-deep/70 hover:text-cardstock sm:px-4 sm:text-sm motion-safe:transition-colors motion-safe:duration-bcc-fast"
            }
          >
            <span>{label}</span>
            {!loading && (
              <span className="bcc-mono ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-sm bg-cardstock-deep/40 px-1 text-[9px] text-ink-soft">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────
// AllTab — interleaves results from the three verticals so the user
// sees a mixed slice of the floor up top. Skeleton state delegates to
// SearchResultsTab's loading branch (one path for all four tabs).
// Empty state shows when all three verticals returned empty; error
// state only when all three failed (a single partial failure still
// renders the surviving rows).
// ─────────────────────────────────────────────────────────────────────

interface AllTabProps {
  query: string;
  projects: ProjectSearchResult[];
  users: UserSearchResult[];
  groups: GroupSearchResult[];
  isLoading: boolean;
  isError: boolean;
}

function AllTab({ query, projects, users, groups, isLoading, isError }: AllTabProps) {
  if (isError || isLoading || (projects.length === 0 && users.length === 0 && groups.length === 0)) {
    return (
      <SearchResultsTab
        kind="projects"
        query={query}
        results={[]}
        isLoading={isLoading}
        isError={isError}
      />
    );
  }

  // Interleave by index: row 0 from each vertical, then row 1, etc.
  // Reads top-to-bottom as a mixed slice of the floor.
  const interleaved: Array<
    | { kind: "project"; row: ProjectSearchResult }
    | { kind: "user"; row: UserSearchResult }
    | { kind: "group"; row: GroupSearchResult }
  > = [];
  const max = Math.max(projects.length, users.length, groups.length);
  for (let i = 0; i < max; i += 1) {
    const p = projects[i];
    const u = users[i];
    const g = groups[i];
    if (p !== undefined) interleaved.push({ kind: "project", row: p });
    if (u !== undefined) interleaved.push({ kind: "user", row: u });
    if (g !== undefined) interleaved.push({ kind: "group", row: g });
  }

  return (
    <ul className="flex flex-col gap-2">
      {interleaved.map((item) => {
        if (item.kind === "project") {
          return (
            <li key={`p-${item.row.page_id}`}>
              <ProjectRow row={item.row} />
            </li>
          );
        }
        if (item.kind === "user") {
          return (
            <li key={`u-${item.row.id}`}>
              <UserRow row={item.row} />
            </li>
          );
        }
        return (
          <li key={`g-${item.row.id}`}>
            <GroupRow row={item.row} />
          </li>
        );
      })}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TrendingLanding — empty-query landing state. Shows top-scored
// projects via the trending endpoint so the page is never blank.
// ─────────────────────────────────────────────────────────────────────

function TrendingLanding() {
  const trending = useTrendingSearches();
  const results = trending.data?.results ?? [];

  return (
    <section>
      <header className="border-b border-dashed border-cardstock/15 pb-3">
        <p className="bcc-mono text-cardstock-deep">TRENDING ON THE FLOOR</p>
      </header>
      <div className="mt-6">
        <SearchResultsTab
          kind="projects"
          // Empty query → EmptyTile renders the trending-landing message
          // instead of echoing a "trending" sentinel as a user query.
          query=""
          results={results}
          isLoading={trending.isLoading}
          isError={trending.isError}
        />
      </div>
    </section>
  );
}
