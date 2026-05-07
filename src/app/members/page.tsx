"use client";

/**
 * /members — directory of human members.
 *
 * Sibling to /directory (which lists validator/project/creator entity
 * cards). This one is pure user-rows. Search across handle +
 * display_name; offset pagination via Prev/Next chips.
 *
 * URL state: `?page=N&q=...` — bookmark-friendly + back-button friendly,
 * same pattern /directory uses for its filters. The search input is
 * debounced (~300ms) so typing doesn't burn API calls per keystroke.
 *
 * Empty/error/loading states per §N10 — every surface explicitly
 * handles all three.
 */

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { MembersGrid } from "@/components/members/MembersGrid";
import { useMembers } from "@/hooks/useMembers";
import type { MembersTypeCounts, MembersTypeFilter } from "@/lib/api/types";

const ZERO_TYPE_COUNTS: MembersTypeCounts = {
  validator: 0,
  project: 0,
  nft: 0,
  dao: 0,
};

const SEARCH_DEBOUNCE_MS = 300;
const PER_PAGE = 24;

const VALID_TYPE_FILTERS: readonly MembersTypeFilter[] = [
  "validator",
  "project",
  "nft",
  "dao",
];

function parseTypeFilter(raw: string | null): MembersTypeFilter | null {
  if (raw === null) return null;
  return (VALID_TYPE_FILTERS as readonly string[]).includes(raw)
    ? (raw as MembersTypeFilter)
    : null;
}

// Filter chip palette mirrors the per-type body colors used on member
// cards (`MembersGrid`'s TypedRoleBadge). Active state = full bg fill;
// inactive = neutral cardstock with a subtle 1px ring. Keeps the chips
// readable as filters without competing with the badges below.
const TYPE_CHIP_PALETTE: Record<
  MembersTypeFilter,
  { bg: string; text: string; ring: string }
> = {
  validator: { bg: "var(--owned-type-validator)", text: "#fff",            ring: "ring-[color:var(--owned-type-validator)]/40" },
  project:   { bg: "var(--owned-type-project)",   text: "var(--ink, #0f0d09)", ring: "ring-[color:var(--owned-type-project)]/40" },
  nft:       { bg: "var(--owned-type-nft)",       text: "#fff",            ring: "ring-[color:var(--owned-type-nft)]/40" },
  dao:       { bg: "var(--owned-type-dao)",       text: "#fff",            ring: "ring-[color:var(--owned-type-dao)]/40" },
};

const TYPE_FILTER_LABEL: Record<MembersTypeFilter, string> = {
  validator: "VALIDATORS",
  project:   "BUILDERS",
  nft:       "NFT CREATORS",
  dao:       "DAOS",
};

export default function MembersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlPage = useMemo(() => {
    const raw = searchParams.get("page");
    const parsed = raw === null ? 1 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [searchParams]);

  const urlQ = useMemo(() => searchParams.get("q") ?? "", [searchParams]);
  const urlType = useMemo(
    () => parseTypeFilter(searchParams.get("type")),
    [searchParams],
  );

  // Local state for the search input — keeps the box responsive while
  // we debounce the URL update.
  const [localQ, setLocalQ] = useState(urlQ);

  useEffect(() => {
    setLocalQ(urlQ);
  }, [urlQ]);

  const lastUrlQRef = useRef<string>(urlQ);
  useEffect(() => {
    if (localQ === lastUrlQRef.current) return;
    const t = window.setTimeout(() => {
      lastUrlQRef.current = localQ;
      pushToUrl(router, { page: 1, q: localQ, type: urlType });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [localQ, router, urlType]);

  const query = useMembers({
    page: urlPage,
    perPage: PER_PAGE,
    q: urlQ,
    type: urlType,
  });

  const goToPage = (next: number) => {
    pushToUrl(router, { page: next, q: urlQ, type: urlType });
  };

  // Chip click handler — toggles the type filter and resets pagination
  // to page 1 (a new filter set is a new view; landing on page 7 of
  // the previous filter would feel buggy).
  const setTypeFilter = (next: MembersTypeFilter | null) => {
    pushToUrl(router, { page: 1, q: urlQ, type: next });
  };

  return (
    <main className="pb-24">
      <Rail />

      <header className="mx-auto max-w-[1560px] px-4 sm:px-7 pt-12">
        <p className="bcc-mono text-safety">THE ROSTER</p>
        <h1
          className="bcc-stencil mt-3 text-cardstock leading-[0.95]"
          style={{ fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)" }}
        >
          Every operator on the floor.
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-cardstock-deep">
          Members in good standing, sorted by who joined most recently. Search
          by handle or name. Click anyone to read their file.
        </p>
      </header>

      <section className="mx-auto mt-10 flex max-w-[1560px] flex-col gap-6 px-4 sm:px-7">
        <label className="flex flex-col gap-1.5">
          <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
            SEARCH
          </span>
          <input
            type="search"
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            placeholder="Handle or display name…"
            maxLength={64}
            className="bcc-mono w-full max-w-md rounded-sm border border-cardstock-edge bg-cardstock-deep/40 px-3 py-2 text-cardstock outline-none placeholder:text-cardstock-deep/60 focus:border-blueprint focus:ring-1 focus:ring-blueprint"
          />
        </label>
        <TypeFilterRow
          active={urlType}
          counts={query.isSuccess ? query.data.type_counts : ZERO_TYPE_COUNTS}
          onSelect={setTypeFilter}
        />
      </section>

      <section className="mx-auto mt-8 max-w-[1560px] px-4 sm:px-7">
        {query.isPending && (
          <p className="bcc-mono text-cardstock-deep">Loading the roster…</p>
        )}

        {query.isError && (
          <div className="bcc-paper p-6">
            <p role="alert" className="bcc-mono text-safety">
              Couldn&apos;t load the roster: {query.error.message}
            </p>
          </div>
        )}

        {query.isSuccess &&
          query.data.items.length === 0 &&
          (urlType !== null ? (
            <RosterFilterEmpty
              activeType={urlType}
              counts={query.data.type_counts}
              onSelectType={setTypeFilter}
            />
          ) : (
            <RosterEmpty hasSearch={urlQ !== ""} />
          ))}

        {query.isSuccess && query.data.items.length > 0 && (
          <>
            <p className="bcc-mono mb-4 text-cardstock-deep">
              {query.data.pagination.total} OPERATOR
              {query.data.pagination.total === 1 ? "" : "S"}
              {urlQ !== "" && ` MATCHING "${urlQ.toUpperCase()}"`}
            </p>
            <MembersGrid items={query.data.items} />
            <Pagination
              page={query.data.pagination.page}
              totalPages={query.data.pagination.total_pages}
              onPage={goToPage}
            />
          </>
        )}
      </section>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────
// TypeFilterRow — "ALL / VALIDATORS / BUILDERS / NFT CREATORS / DAOS"
// chip strip. Each filter chip lights up in its canonical type color
// when active (mirrors the per-type body colors used on member cards),
// matches the existing rank-chip pattern of "active = full fill".
// State is held in the URL (?type=...); this component is stateless.
// ──────────────────────────────────────────────────────────────────────

function TypeFilterRow({
  active,
  counts,
  onSelect,
}: {
  active: MembersTypeFilter | null;
  counts: MembersTypeCounts;
  onSelect: (next: MembersTypeFilter | null) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
        FILTER BY ROLE
      </span>
      <div className="flex flex-wrap gap-2">
        <FilterChip
          isActive={active === null}
          onClick={() => onSelect(null)}
          activeStyle={{ background: "var(--ink, #0f0d09)", color: "var(--cardstock, #f0e3c2)" }}
          label="ALL"
        />
        {VALID_TYPE_FILTERS.map((type) => {
          const palette = TYPE_CHIP_PALETTE[type];
          const count = counts[type];
          const isActive = active === type;
          // Hide zero-count chips unless they're the currently-active
          // filter — preserve the active chip even at 0 so the viewer
          // can deselect (e.g., they had `?type=dao` and the count
          // dropped to 0 between renders).
          if (count === 0 && !isActive) {
            return null;
          }
          return (
            <FilterChip
              key={type}
              isActive={isActive}
              onClick={() => onSelect(isActive ? null : type)}
              activeStyle={{ background: palette.bg, color: palette.text }}
              label={`${TYPE_FILTER_LABEL[type]} · ${count}`}
            />
          );
        })}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// RosterFilterEmpty — filter-specific empty state. Renders when the
// user has a `?type=...` filter active AND the result set is empty.
// Suggests alternative filters that DO have results so the user has a
// concrete next click instead of a dead end.
//
// Cold-start fallback: when every type is at zero (brand-new instance),
// the suggestion strip collapses to a single "Show all members"
// affordance — no list of zero-count chips.
// ──────────────────────────────────────────────────────────────────────

const TYPE_EMPTY_COPY: Record<MembersTypeFilter, { heading: string; body: string }> = {
  validator: {
    heading: "No validators on the floor yet.",
    body: "When members claim validator pages, they'll show up here. Want to be first? Spin up a node and tag your page.",
  },
  project: {
    heading: "No builders on the floor yet.",
    body: "When members ship a project page, they'll show up here. Got something on the workbench? Claim it.",
  },
  nft: {
    heading: "No NFT creators on the floor yet.",
    body: "When members claim an NFT-collection page, they'll show up here. Cooking a drop? Get a page on file.",
  },
  dao: {
    heading: "No DAOs on the floor yet.",
    body: "When members claim a DAO page, they'll show up here. Running a coordination layer? Get it on the floor.",
  },
};

function RosterFilterEmpty({
  activeType,
  counts,
  onSelectType,
}: {
  activeType: MembersTypeFilter;
  counts: MembersTypeCounts;
  onSelectType: (next: MembersTypeFilter | null) => void;
}) {
  const copy = TYPE_EMPTY_COPY[activeType];

  // Suggestions = the OTHER types with at least one user. Render in
  // canonical order (validator → project → nft → dao); skip the active
  // type since the user already knows it's empty.
  const suggestions = VALID_TYPE_FILTERS.filter(
    (t) => t !== activeType && counts[t] > 0,
  );

  return (
    <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
      <p className="bcc-mono mb-2 text-safety">QUIET FLOOR</p>
      <h2 className="bcc-stencil text-3xl text-ink">{copy.heading}</h2>
      <p className="mt-3 font-serif italic leading-relaxed text-ink-soft">
        {copy.body}
      </p>

      {suggestions.length > 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          <span className="bcc-mono text-[10px] tracking-[0.24em] text-ink-soft">
            TRY ONE OF THESE
          </span>
          <div className="flex flex-wrap justify-center gap-2">
            {suggestions.map((type) => {
              const palette = TYPE_CHIP_PALETTE[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => onSelectType(type)}
                  className="bcc-mono px-3 py-1.5 text-[10px] tracking-[0.18em] transition hover:opacity-90"
                  style={{ background: palette.bg, color: palette.text }}
                >
                  {TYPE_FILTER_LABEL[type]} · {counts[type]}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onSelectType(null)}
          className="bcc-mono mt-6 inline-flex items-center gap-2 border border-cardstock-edge bg-cardstock px-3 py-1.5 text-[10px] tracking-[0.18em] text-ink transition hover:bg-cardstock-deep/40"
        >
          SHOW ALL MEMBERS
        </button>
      )}
    </div>
  );
}

function FilterChip({
  isActive,
  onClick,
  activeStyle,
  label,
}: {
  isActive: boolean;
  onClick: () => void;
  activeStyle: { background: string; color: string };
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={isActive}
      className={
        "bcc-mono px-3 py-1.5 text-[10px] tracking-[0.18em] transition " +
        (isActive
          ? ""
          : "border border-cardstock-edge bg-cardstock-deep/30 text-cardstock hover:bg-cardstock-deep/50")
      }
      style={isActive ? activeStyle : undefined}
    >
      {label}
    </button>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Rail — top status strip mirroring /directory's vocabulary.
// ──────────────────────────────────────────────────────────────────────

function Rail() {
  return (
    <div className="border-b border-dashed border-cardstock/15">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-7 py-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; MEMBERS</span>
        </span>
        <span className="bcc-mono text-cardstock/50">FILE INDEX &nbsp;//&nbsp; ALL OPERATORS</span>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Pagination — Prev/Next chips with a "page X of Y" readout in between.
// Disabled chips render flat-disabled instead of being hidden so the
// layout doesn't shift when the user lands on the first or last page.
// ──────────────────────────────────────────────────────────────────────

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (next: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      className="bcc-mono mt-8 flex items-center justify-between gap-3 text-[11px] tracking-[0.16em] text-cardstock-deep"
      aria-label="Pagination"
    >
      <button
        type="button"
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="border-2 border-cardstock-edge px-3 py-1 transition hover:border-ink/50 hover:text-ink disabled:opacity-40"
      >
        ← PREV
      </button>
      <span>
        PAGE {page} / {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPage(Math.min(totalPages, page + 1))}
        disabled={page >= totalPages}
        className="border-2 border-cardstock-edge px-3 py-1 transition hover:border-ink/50 hover:text-ink disabled:opacity-40"
      >
        NEXT →
      </button>
    </nav>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Empty state — different copy when the user has searched vs. when the
// roster is genuinely empty.
// ──────────────────────────────────────────────────────────────────────

function RosterEmpty({ hasSearch }: { hasSearch: boolean }) {
  if (hasSearch) {
    return (
      <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
        <p className="bcc-mono mb-2 text-safety">NO MATCHES</p>
        <h2 className="bcc-stencil text-3xl text-ink">
          Nobody by that name on the floor.
        </h2>
        <p className="mt-3 font-serif italic leading-relaxed text-ink-soft">
          Try a different handle, or clear the search to see everyone.
        </p>
      </div>
    );
  }
  return (
    <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
      <p className="bcc-mono mb-2 text-safety">QUIET ROSTER</p>
      <h2 className="bcc-stencil text-3xl text-ink">
        No operators on file yet.
      </h2>
      <p className="mt-3 font-serif italic leading-relaxed text-ink-soft">
        Once members start signing up, they&apos;ll show up here.
      </p>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// URL helpers — keep query state in the URL so a refresh / back-button
// trip lands the user on the same view.
// ──────────────────────────────────────────────────────────────────────

interface UrlState {
  page: number;
  q: string;
  type: MembersTypeFilter | null;
}

function pushToUrl(
  router: ReturnType<typeof useRouter>,
  state: UrlState,
): void {
  const params = new URLSearchParams();
  if (state.page > 1) {
    params.set("page", String(state.page));
  }
  if (state.q !== "") {
    params.set("q", state.q);
  }
  if (state.type !== null) {
    params.set("type", state.type);
  }
  const qs = params.toString();
  router.replace(qs !== "" ? `/members?${qs}` : "/members", { scroll: false });
}
