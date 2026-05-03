/**
 * /locals — directory of Locals (per §E3 + §G1).
 *
 * Server component. URL is the source of truth for the chain filter
 * and the page index — keeps Back/Forward + share-link working
 * without bolting on client-side router state.
 *
 * Filter UI: a strip of chain chips (All + the §B4 home-chain set).
 * Each chip links to `/locals?chain=…` so navigation is plain
 * <Link> hops; no client state needed.
 *
 * Pagination: backend exposes offset pagination (per §1.5) — we
 * render Prev / Next buttons that bump the `page` query param.
 *
 * Auth: anon allowed. When a session exists we forward the bearer so
 * each item's `viewer_membership` block is populated.
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { getLocals } from "@/lib/api/locals-endpoints";
import type { LocalItem } from "@/lib/api/types";

interface PageProps {
  // Next 15 App Router: searchParams is async per the routes contract.
  searchParams: Promise<{
    chain?: string;
    page?: string;
  }>;
}

interface ChainFilter {
  /** URL value; null = "All" (no filter). */
  value: string | null;
  label: string;
}

const CHAIN_FILTERS: ReadonlyArray<ChainFilter> = [
  { value: null,        label: "All" },
  { value: "cosmos",    label: "Cosmos" },
  { value: "osmosis",   label: "Osmosis" },
  { value: "injective", label: "Injective" },
  { value: "ethereum",  label: "Ethereum" },
  { value: "solana",    label: "Solana" },
];

export default async function LocalsDirectoryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const chain = typeof params.chain === "string" && params.chain !== "" ? params.chain : null;
  const page = clampPage(params.page);

  const session = await getServerSession(authOptions);
  const token = session?.bccToken ?? null;

  // Failure non-fatal: render an empty grid + a small error note. The
  // directory shouldn't 500 the whole page on a transient backend
  // hiccup; a refresh recovers.
  let result;
  let fetchError: string | null = null;
  try {
    result = await getLocals(
      { ...(chain !== null ? { chain } : {}), page, page_size: 24 },
      token
    );
  } catch (err) {
    result = null;
    fetchError = err instanceof Error ? err.message : "Couldn't load Locals.";
  }

  const items = result?.items ?? [];
  const pagination = result?.pagination ?? null;

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-6xl px-8 pt-12">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          DIRECTORY · LOCALS
        </span>
        <h1 className="bcc-stencil mt-2 text-5xl text-cardstock md:text-6xl">
          Locals
        </h1>
        <p className="mt-3 max-w-2xl font-serif text-lg text-cardstock-deep">
          Per-chain rooms where members organize, hang, and bias their
          feeds. Pick your home Local from your settings; you can hold
          membership in many.
        </p>
      </section>

      <section className="mx-auto mt-8 max-w-6xl px-8">
        <ChainFilterStrip activeChain={chain} />
      </section>

      <section className="mx-auto mt-6 max-w-6xl px-8">
        {fetchError !== null ? (
          <p role="alert" className="bcc-mono text-safety">
            Couldn&apos;t load Locals: {fetchError}
          </p>
        ) : items.length === 0 ? (
          <EmptyState chain={chain} />
        ) : (
          <LocalsGrid items={items} />
        )}
      </section>

      {pagination !== null && pagination.total_pages > 1 && (
        <section className="mx-auto mt-8 max-w-6xl px-8">
          <Pagination chain={chain} pagination={pagination} />
        </section>
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function ChainFilterStrip({ activeChain }: { activeChain: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CHAIN_FILTERS.map((filter) => {
        const isActive = filter.value === activeChain;
        const href = (filter.value === null
          ? "/locals"
          : `/locals?chain=${encodeURIComponent(filter.value)}`) as Route;
        return (
          <Link
            key={filter.label}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={
              "bcc-mono rounded-full px-3 py-1.5 text-[11px] tracking-[0.16em] transition " +
              (isActive
                ? "bg-ink text-cardstock"
                : "border border-cardstock-edge/40 bg-cardstock text-ink-soft hover:border-cardstock-edge hover:text-ink")
            }
          >
            {filter.label.toUpperCase()}
          </Link>
        );
      })}
    </div>
  );
}

function LocalsGrid({ items }: { items: LocalItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.id}>
          <LocalCard item={item} />
        </li>
      ))}
    </ul>
  );
}

function LocalCard({ item }: { item: LocalItem }) {
  // Server-supplied path → typedRoutes-safe via Route cast (same pattern
  // as CardFactory's `links.self`).
  const href = item.links.self as Route;

  return (
    <Link
      href={href}
      className="bcc-panel block px-5 py-4 transition hover:border-cardstock-edge"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
          {item.chain !== null ? item.chain.toUpperCase() : "GENERAL"}
        </span>
        {item.number !== null && (
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
            #{item.number}
          </span>
        )}
      </div>

      <h2 className="bcc-stencil mt-2 text-xl text-ink">{item.name}</h2>

      <div className="mt-3 flex items-center justify-between">
        <span className="bcc-mono text-[10px] text-ink-soft">
          {item.member_count} member{item.member_count === 1 ? "" : "s"}
        </span>
        <ViewerBadge membership={item.viewer_membership} />
      </div>
    </Link>
  );
}

function ViewerBadge({ membership }: { membership: LocalItem["viewer_membership"] }) {
  if (membership === null || !membership.is_member) {
    return null;
  }
  if (membership.is_primary) {
    return (
      <span
        className="bcc-mono rounded-sm px-2 py-0.5 text-[9px] tracking-[0.18em]"
        style={{
          color: "var(--verified)",
          background: "rgba(44,157,102,0.10)",
          border: "1px solid rgba(44,157,102,0.32)",
        }}
      >
        ★ PRIMARY
      </span>
    );
  }
  return (
    <span
      className="bcc-mono rounded-sm px-2 py-0.5 text-[9px] tracking-[0.18em] text-ink"
      style={{
        background: "rgba(15,13,9,0.06)",
        border: "1px solid rgba(15,13,9,0.16)",
      }}
    >
      MEMBER
    </span>
  );
}

function EmptyState({ chain }: { chain: string | null }) {
  return (
    <div className="bcc-panel mx-auto max-w-xl p-8 text-center">
      <p className="bcc-mono text-safety">NO LOCALS</p>
      <h2 className="bcc-stencil mt-2 text-3xl text-ink">
        {chain !== null
          ? `Nothing chartered on ${chain}.`
          : "No Locals chartered yet."}
      </h2>
      <p className="mt-3 font-serif leading-relaxed text-ink-soft">
        {chain !== null
          ? "Try a different chain, or pull the filter and see what's already on the books."
          : "Locals are how members of the same chain or scene cluster up. None on the books yet — first one's coming."}
      </p>
    </div>
  );
}

function Pagination({
  chain,
  pagination,
}: {
  chain: string | null;
  pagination: { page: number; total_pages: number };
}) {
  const { page, total_pages } = pagination;
  const baseQuery = chain !== null ? `chain=${encodeURIComponent(chain)}` : "";

  const buildHref = (target: number): Route => {
    const parts: string[] = [];
    if (baseQuery !== "") parts.push(baseQuery);
    parts.push(`page=${target}`);
    return `/locals?${parts.join("&")}` as Route;
  };

  const hasPrev = page > 1;
  const hasNext = page < total_pages;

  return (
    <nav className="flex items-center justify-between" aria-label="Pagination">
      {hasPrev ? (
        <Link
          href={buildHref(page - 1)}
          rel="prev"
          className="bcc-mono text-cardstock-deep hover:underline"
        >
          ← Previous
        </Link>
      ) : (
        <span className="bcc-mono text-cardstock-deep/40">← Previous</span>
      )}

      <span className="bcc-mono text-[10px] text-cardstock-deep">
        PAGE {page} / {total_pages}
      </span>

      {hasNext ? (
        <Link
          href={buildHref(page + 1)}
          rel="next"
          className="bcc-mono text-cardstock-deep hover:underline"
        >
          Next →
        </Link>
      ) : (
        <span className="bcc-mono text-cardstock-deep/40">Next →</span>
      )}
    </nav>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function clampPage(raw: string | undefined): number {
  if (typeof raw !== "string") return 1;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}
