/**
 * /search — multi-vertical search results page (§G1 page-level).
 *
 * Server component shell. Reads `?q=` from searchParams and hands it
 * to <SearchResultsPage>, which owns the interactive tab state +
 * per-vertical React Query hooks.
 *
 * Why a server shell with a client body:
 *   - Title rendering (`Results for "{q}"`) happens before JS hydrates,
 *     so screen readers + crawlers see the query immediately.
 *   - The tabs + result fetches are pure client interaction; SSR-ing
 *     them would add a hydration round-trip without payoff (the
 *     bcc-search endpoints are anon-OK so SSR pre-fetch would just be
 *     a duplicate request).
 *
 * /directory still exists as the paginated browse surface. The two
 * routes are intentionally separate: /search is query-first
 * (multi-vertical), /directory is filter-first (card grid).
 */

import { SearchResultsPage } from "@/components/search/SearchResultsPage";

interface PageProps {
  // Next 15 App Router: searchParams is async per the routes contract.
  searchParams: Promise<{ q?: string; tab?: string }>;
}

export async function generateMetadata({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const trimmed = typeof q === "string" ? q.trim() : "";
  if (trimmed === "") {
    return { title: "Search · Blue Collar Crypto" };
  }
  return { title: `Search: ${trimmed} · Blue Collar Crypto` };
}

export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";

  return (
    <main className="mx-auto max-w-[1200px] px-7 pb-24 pt-12">
      <div className="border-b border-dashed border-cardstock/15 pb-3">
        <span className="bcc-mono inline-flex items-center gap-2 text-cardstock-deep">
          <span className="bcc-rail-dot" aria-hidden />
          <span>FLOOR &nbsp;//&nbsp; SEARCH</span>
        </span>
      </div>

      <header className="mt-10">
        <p className="bcc-mono text-safety">SEARCH</p>
        <h1
          className="bcc-stencil mt-2 text-cardstock leading-[0.95]"
          style={{ fontSize: "clamp(2.25rem, 5.5vw, 4.5rem)" }}
        >
          {query.trim() !== "" ? "What you came for." : "Pick a thread."}
        </h1>
        <p className="mt-3 max-w-2xl font-serif leading-relaxed text-cardstock-deep">
          Three verticals from one box — <strong>projects</strong>,{" "}
          <strong>users</strong>, and <strong>groups</strong>. Type into the bar
          up top, or jump in via a trending thread below.
        </p>
      </header>

      <div className="mt-10">
        <SearchResultsPage query={query} />
      </div>
    </main>
  );
}
