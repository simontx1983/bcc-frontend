"use client";

/**
 * /mentors — directory of actively listed mentors (Rank Phase 7,
 * §21.4, contract v1.62).
 *
 * Thin wrapper over the /members data layer with the `mentors=1` axis
 * LOCKED — same promotion pattern as /validators over /directory. Rows
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

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, Suspense } from "react";

import { CardGrid } from "@/components/cards/CardGrid";
import { PagerNav } from "@/components/ui/PagerNav";
import { useMembers } from "@/hooks/useMembers";
import { humanizeCode } from "@/lib/api/errors";

const PER_PAGE = 24;

function MentorsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlPage = useMemo(() => {
    const raw = searchParams.get("page");
    const parsed = raw === null ? 1 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [searchParams]);

  const query = useMembers({
    page: urlPage,
    perPage: PER_PAGE,
    mentors: true,
  });

  const goToPage = (next: number) => {
    router.replace(next > 1 ? `/mentors?page=${next}` : "/mentors", {
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
      <Rail />

      <header className="mx-auto max-w-[1560px] px-4 sm:px-7 pt-12">
        <p className="bcc-mono text-safety">THE BENCH</p>
        <h1
          className="bcc-stencil mt-3 text-bcc-text leading-[0.95]"
          style={{ fontSize: "clamp(2.5rem, 6.5vw, 5.5rem)" }}
        >
          Mentors on the floor.
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-bcc-text-secondary">
          Veteran operators in Trusted standing who&apos;ve raised their hand
          to help newer members. Click anyone to read their file.
        </p>
      </header>

      <section className="mx-auto mt-10 max-w-[1560px] px-4 sm:px-7">
        {query.isPending && (
          <p className="bcc-mono text-bcc-text-secondary">Loading mentors…</p>
        )}

        {query.isError && (
          <div className="bcc-paper p-6">
            <p role="alert" className="bcc-mono text-safety">
              {/* §γ — copy is keyed on err.code; never render err.message. */}
              {humanizeCode(
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
            </p>
          </div>
        )}

        {query.isSuccess && mentorCards.length === 0 && <MentorsEmpty />}

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

function Rail() {
  return (
    <div className="border-b border-dashed border-bcc-border">
      <div className="mx-auto flex max-w-[1560px] flex-wrap items-center justify-between gap-4 px-7 py-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-bcc-text-secondary">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; MENTORS</span>
        </span>
        <span className="bcc-mono text-bcc-text-muted">
          FILE INDEX &nbsp;//&nbsp; LISTED MENTORS
        </span>
      </div>
    </div>
  );
}

function MentorsEmpty() {
  return (
    <div className="bcc-paper mx-auto max-w-2xl p-8 text-center">
      <p className="bcc-mono mb-2 text-safety">QUIET BENCH</p>
      <h2 className="bcc-stencil text-3xl text-ink">
        No mentors are listed yet.
      </h2>
      <p className="mt-3 font-serif italic leading-relaxed text-ink-soft">
        Veteran operators in Trusted standing can list themselves from their
        profile settings. When they do, they&apos;ll show up here.
      </p>
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
