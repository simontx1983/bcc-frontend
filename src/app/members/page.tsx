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

const SEARCH_DEBOUNCE_MS = 300;
const PER_PAGE = 24;

export default function MembersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlPage = useMemo(() => {
    const raw = searchParams.get("page");
    const parsed = raw === null ? 1 : Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
  }, [searchParams]);

  const urlQ = useMemo(() => searchParams.get("q") ?? "", [searchParams]);

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
      pushToUrl(router, { page: 1, q: localQ });
    }, SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [localQ, router]);

  const query = useMembers({ page: urlPage, perPage: PER_PAGE, q: urlQ });

  const goToPage = (next: number) => {
    pushToUrl(router, { page: next, q: urlQ });
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

      <section className="mx-auto mt-10 max-w-[1560px] px-4 sm:px-7">
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

        {query.isSuccess && query.data.items.length === 0 && (
          <RosterEmpty hasSearch={urlQ !== ""} />
        )}

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
  const qs = params.toString();
  router.replace(qs !== "" ? `/members?${qs}` : "/members", { scroll: false });
}
