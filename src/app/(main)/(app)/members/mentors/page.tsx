"use client";

/**
 * /members/mentors — Members ▸ Mentors, the directory of actively listed
 * mentors (Rank Phase 7, §21.4, contract v1.62). Moved from the old
 * top-level /mentors, which forwards here (src/lib/route-moves.ts).
 *
 * Thin wrapper over the /members data layer with the `mentors=1` axis
 * LOCKED — same pattern as Explore ▸ Validators over the shared
 * directory data layer. Rows
 * are full member `Card` view-models; CardGrid renders the canonical
 * trading card (which carries the MENTOR chip when `is_mentor` is true).
 *
 * URL state: `?page=N` — searchParams as source of truth, mirroring
 * /members.
 *
 * Old-backend tolerance: a pre-Phase-7 backend IGNORES the `mentors`
 * param and returns plain members with no per-row `is_mentor`. Mentor
 * semantics therefore gate on the rows actually carrying
 * `is_mentor === true` — when none do, this page renders its empty
 * state rather than mislabeling plain members as mentors.
 */

import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, Suspense } from "react";

import { RouteRail } from "@/components/layout/RouteRail";
import { ScopedSearchField } from "@/components/search/ScopedSearchField";
import { SearchEverywhereLink } from "@/components/search/SearchEverywhereLink";
import { CardGrid } from "@/components/cards/CardGrid";
import { PagerNav } from "@/components/ui/PagerNav";
import { SectionTabs } from "@/components/ui/SectionTabs";
import { useMembers } from "@/hooks/useMembers";
import { LoadFailure } from "@/components/ui/LoadFailure";
import { humanizeCode } from "@/lib/api/errors";
import type { MembersResponse } from "@/lib/api/types";

import { MEMBERS_TABS } from "../members-tabs";

const PER_PAGE = 24;
const SEARCH_DEBOUNCE_MS = 300;

/** `/members/mentors?page=N&q=…`: the query lives in the URL so Back and sharing work. */
function mentorsHref(page: number, q: string): string {
  const params = new URLSearchParams();
  if (page > 1) params.set("page", String(page));
  if (q !== "") params.set("q", q);
  const qs = params.toString();
  return qs === "" ? "/members/mentors" : `/members/mentors?${qs}`;
}

function MentorsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlPage = useMemo(() => {
    const raw = searchParams.get("page");
    const parsed = raw === null ? 1 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [searchParams]);

  // Scoped search (Structure A §9): the SERVER searches mentors (q with
  // mentors=1, capped at 64 like /members). Local state keeps the field
  // responsive; the URL follows after a short debounce.
  const urlQ = useMemo(() => searchParams.get("q") ?? "", [searchParams]);
  const [localQ, setLocalQ] = useState(urlQ);
  useEffect(() => {
    setLocalQ(urlQ);
  }, [urlQ]);
  const lastUrlQRef = useRef<string>(urlQ);
  useEffect(() => {
    if (localQ === lastUrlQRef.current) return;
    const t = window.setTimeout(() => {
      lastUrlQRef.current = localQ;
      router.replace(mentorsHref(1, localQ) as Route, { scroll: false });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [localQ, router]);

  const query = useMembers({
    page: urlPage,
    perPage: PER_PAGE,
    q: urlQ,
    mentors: true,
  });

  // Last good pagination, held locally so a failed page keeps its pager.
  // Not solved with `placeholderData` on the hook: `useMembers` is shared
  // with /members and other surfaces, so changing its caching semantics
  // would reach past this page. Same reasoning as WatchersPanel.
  const [lastPagination, setLastPagination] = useState<
    MembersResponse["pagination"] | undefined
  >(undefined);
  useEffect(() => {
    if (query.data !== undefined) {
      setLastPagination(query.data.pagination);
    }
  }, [query.data]);

  const goToPage = (next: number) => {
    router.replace(mentorsHref(next, urlQ) as Route, {
      scroll: false,
    });
  };

  // §21.4 — mentor semantics gate on the per-row field, never on the
  // filter having been sent. Against the current backend `mentors=1`
  // returns only listed mentors (every row carries the flag); against
  // a pre-Phase-7 backend no row carries it and we render emptiness.
  const mentorCards = query.isSuccess
    ? query.data.items.filter((card) => card.is_mentor === true)
    : [];

  return (
    <main className="bcc-page-wide pb-24">
      <RouteRail kicker={"FLOOR \u00a0//\u00a0 MEMBERS"} label={"FILE INDEX \u00a0//\u00a0 LISTED MENTORS"} />

      <header className="mx-auto max-w-[1560px] px-4 sm:px-7 pt-12">
        <p className="bcc-mono text-bcc-text-safety">THE BENCH</p>
        <h1
          className="bcc-stencil mt-3 text-bcc-text leading-[0.95]"
          style={{ fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)" }}
        >
          Mentors on the floor.
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-bcc-text-secondary">
          Veteran members in Trusted standing who&apos;ve raised their hand
          to help newer members. Click anyone to read their file.
        </p>
      </header>

      <SectionTabs label="Members sections" tabs={MEMBERS_TABS} />

      <section className="mx-auto mt-10 max-w-[1560px] px-4 sm:px-7">
        <div className="mb-6 w-full max-w-md">
          <ScopedSearchField
            label="SEARCH"
            placeholder="Search mentors by name or @handle…"
            value={localQ}
            onChange={setLocalQ}
            onClear={() => setLocalQ("")}
            maxLength={64}
          />
        </div>

        {query.isPending && (
          <p className="bcc-mono text-bcc-text-secondary">Loading mentors…</p>
        )}

        {query.isError && (
          <>
            <div className="bcc-paper p-6">
              <LoadFailure
                surface="paper"
                /* §γ — copy is keyed on err.code; never render err.message. */
                message={humanizeCode(
                  query.error,
                  {
                    bcc_unauthorized: "Sign in to browse mentors.",
                    bcc_rate_limited:
                      "Loading too fast — give it a moment and try again.",
                    bcc_unavailable:
                      "The mentor list is temporarily unavailable. Try again shortly.",
                  },
                  "Couldn't load the mentor list. Try again in a moment.",
                )}
                onRetry={() => void query.refetch()}
              />
            </div>

            {/* A failed page must not strand the operator — see /members.
                Rendered at the requested page against the last good total,
                so PREV steps back to a page that worked. */}
            {lastPagination !== undefined && (
              <PagerNav
                page={urlPage}
                totalPages={lastPagination.total_pages}
                onPageChange={goToPage}
              />
            )}
          </>
        )}

        {query.isSuccess && mentorCards.length === 0 &&
          (urlQ !== "" ? <MentorsNoMatch query={urlQ} /> : <MentorsEmpty />)}

        {query.isSuccess && mentorCards.length > 0 && (
          <>
            <p className="bcc-mono mb-4 text-bcc-text-secondary">
              {mentorCards.length} MENTOR{mentorCards.length === 1 ? "" : "S"}
              {query.data.pagination.total_pages > 1 && " ON THIS PAGE"}
            </p>
            <CardGrid cards={mentorCards} />
            <PagerNav
              page={query.data.pagination.page}
              totalPages={query.data.pagination.total_pages}
              onPageChange={goToPage}
            />
          </>
        )}
      </section>
    </main>
  );
}

function MentorsEmpty() {
  return (
    <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
      <p className="bcc-mono mb-2 text-bcc-text-safety">QUIET BENCH</p>
      <h2 className="bcc-stencil text-3xl text-ink">
        No mentors are listed yet.
      </h2>
      <p className="mt-3 font-serif italic leading-relaxed text-ink-soft">
        Veteran members in Trusted standing can list themselves from their
        profile settings. When they do, they&apos;ll show up here.
      </p>
    </div>
  );
}

function MentorsNoMatch({ query }: { query: string }) {
  return (
    <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
      <p className="bcc-mono mb-2 text-bcc-text-safety">NO MATCHES</p>
      <h2 className="bcc-stencil text-3xl text-ink">No mentor by that name.</h2>
      <p className="mt-3 font-serif italic leading-relaxed text-ink-soft">
        Mentors are searched by name and @handle. Clear the search to see them all.
      </p>
      <SearchEverywhereLink query={query} surface="paper" />
    </div>
  );
}

export default function MentorsPage() {
  return (
    <Suspense>
      <MentorsPageContent />
    </Suspense>
  );
}
