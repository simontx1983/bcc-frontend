/**
 * /communities — cross-kind community discovery (§4.7.4).
 *
 * Server component. URL is the source of truth for filter + page index
 * (matches /locals pattern) so Back/Forward + share-link "just work"
 * without bolting on client router state.
 *
 * Filter UI: a single binary chip strip — All / On-Chain Verified.
 * The verified=1 backend filter restricts to NFT-gated holder groups
 * per contract §4.7.4 line 1678.
 *
 * Pagination: backend offset pagination (page/page_size, max 50/page).
 * The candidate pool is server-capped at 500 before sort+pagination —
 * v1 scale is well under this.
 *
 * Auth: anon allowed. We forward the bearer when present so the
 * 60-second `public, max-age=60` server cache still serves the same
 * shape regardless of viewer (the endpoint returns no per-viewer
 * fields).
 *
 * Cards: every discovery item arrives with a full §L5 `card`
 * view-model (card_kind "community"), so the grid composes
 * CardFactory directly — same trading-card chassis as /directory and
 * /members. Click-through lives in the card's OPEN cell
 * (card.links.self → /communities/[slug] or /locals/[slug],
 * server-resolved); JOIN wiring lives in CommunityCardGrid.
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { tokenFromSession } from "@/lib/api/client";
import { humanizeCode } from "@/lib/api/errors";
import { getGroupsDiscovery } from "@/lib/api/groups-discovery-endpoints";
import { COMMUNITY_CHAIN_CATALOG } from "@/lib/communities/chain-catalog";
import { CommunityCardGrid } from "@/components/communities/CommunityCardGrid";
import type { GroupsDiscoveryPagination } from "@/lib/api/types";

interface PageProps {
  // Next 15 App Router: searchParams is async per the routes contract.
  searchParams: Promise<{
    verified?: string;
    mine?: string;
    chain?: string;
    page?: string;
  }>;
}

export default async function CommunitiesDiscoveryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const verifiedOnly = params.verified === "1";
  const mineOnly = params.mine === "1";
  const chain = normalizeChainSlug(params.chain);
  const page = clampPage(params.page);

  const session = await getServerSession(authOptions);
  const token = tokenFromSession(session);

  let result;
  let fetchError: string | null = null;
  try {
    result = await getGroupsDiscovery(
      {
        verified: verifiedOnly,
        mine: mineOnly,
        ...(chain !== null ? { chain } : {}),
        page,
        page_size: 24,
      },
      token
    );
  } catch (err) {
    result = null;
    // §γ — copy is keyed on err.code; never render err.message.
    fetchError = humanizeCode(
      err,
      {
        bcc_rate_limited: "Loading too fast — give it a moment and try again.",
        bcc_unavailable: "Communities are temporarily unavailable. Try again shortly.",
      },
      "Couldn't load communities. Try again in a moment.",
    );
  }

  const items = result?.items ?? [];
  const pagination = result?.pagination ?? null;
  const isAnon = session === null;

  return (
    // `bcc-page-wide` opts this grid page out of the app shell's 680px
    // reading-width cap (see globals.css escape hatch) — the trading-
    // card grid needs the full viewport to go multi-column.
    <main className="bcc-page-wide min-h-screen pb-24">
      <section className="mx-auto max-w-[1440px] px-6 pt-12 sm:px-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="min-w-0 flex-1">
            <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
              DISCOVERY · COMMUNITIES
            </span>
            <h1 className="bcc-stencil mt-2 text-5xl text-cardstock md:text-6xl">
              Communities
            </h1>
            <p className="mt-3 max-w-2xl font-serif text-lg text-cardstock-deep">
              Active rooms across the floor. <span className="bcc-mono">HOLDERS</span> are NFT-gated,
              <span className="bcc-mono"> LOCAL</span> rooms cluster by chain, and the rest are open
              rooms anyone can join. Verified rooms rank first, then warmest, then largest — so
              you see the rooms worth walking into, not the dead ones.
            </p>
          </div>

          <CreateCommunityCta isAnon={isAnon} />
        </div>
      </section>

      {/* Chain dropdown — own row above the scope pills so the chain
          choice reads as the primary filter axis. Scope pills below
          compose with whichever chain is active. */}
      <section className="mx-auto mt-8 max-w-[1440px] px-6 sm:px-8">
        <ChainDropdown
          chain={chain}
          scope={mineOnly ? "mine" : verifiedOnly ? "verified" : "all"}
        />
      </section>

      <section className="mx-auto mt-4 max-w-[1440px] px-6 sm:px-8">
        <FilterStrip
          verifiedOnly={verifiedOnly}
          mineOnly={mineOnly}
          chain={chain}
        />
      </section>

      <section className="mx-auto mt-6 max-w-[1440px] px-6 sm:px-8">
        {fetchError !== null ? (
          <p role="alert" className="bcc-mono text-safety">
            {fetchError}
          </p>
        ) : items.length === 0 ? (
          <EmptyState
            verifiedOnly={verifiedOnly}
            mineOnly={mineOnly}
            chain={chain}
            isAnon={isAnon}
          />
        ) : (
          <CommunityCardGrid items={items} />
        )}
      </section>

      {pagination !== null && pagination.total_pages > 1 && (
        <section className="mx-auto mt-8 max-w-[1440px] px-6 sm:px-8">
          <Pagination
            verifiedOnly={verifiedOnly}
            mineOnly={mineOnly}
            chain={chain}
            pagination={pagination}
          />
        </section>
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

/**
 * Three mutually-exclusive scope pills + a chain dropdown.
 *
 *   - All        → /communities                       (default)
 *   - Verified   → /communities?verified=1            (NFT-gated only)
 *   - My         → /communities?mine=1                (viewer's memberships)
 *
 * The chain dropdown composes with whichever scope pill is active —
 * picking a chain preserves the current `verified` / `mine` selection.
 * Picking a chain on the All scope simply adds `?chain=<slug>`. When
 * a chain is selected and the result is empty (e.g. no member
 * communities on Stargaze), the empty-state copy explains the
 * combined filter rather than the scope alone.
 *
 * Same dropdown vocabulary as /directory's CHAIN filter so the two
 * surfaces feel like the same product.
 */
function FilterStrip({
  verifiedOnly,
  mineOnly,
  chain,
}: {
  verifiedOnly: boolean;
  mineOnly: boolean;
  chain: string | null;
}) {
  const filters: ReadonlyArray<{
    key: "all" | "verified" | "mine";
    label: string;
    isActive: boolean;
  }> = [
    {
      key: "all",
      label: "All",
      isActive: !verifiedOnly && !mineOnly,
    },
    {
      key: "verified",
      label: "Verified",
      isActive: verifiedOnly && !mineOnly,
    },
    {
      key: "mine",
      label: "My communities",
      isActive: mineOnly,
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => (
        <Link
          key={filter.key}
          href={buildCommunitiesHref({
            scope: filter.key,
            chain,
          })}
          aria-current={filter.isActive ? "page" : undefined}
          className={
            "bcc-mono rounded-full px-3 py-1.5 text-[11px] tracking-[0.16em] transition " +
            (filter.isActive
              ? "bg-ink text-cardstock"
              : "border border-cardstock-edge/40 bg-cardstock text-ink-soft hover:border-cardstock-edge hover:text-ink")
          }
        >
          {filter.label.toUpperCase()}
        </Link>
      ))}
    </div>
  );
}

/**
 * Hero-anchored CTA pointing at PeepSo's existing create-group page.
 * V1: links out to PeepSo's `/community/groups/` index where the
 * "+ Create new group" affordance lives — keeps the surface zero-code
 * and gets users to a working create flow today. An in-app inline
 * modal is a V1.5 path (would call PeepSo's REST or a new BCC
 * endpoint; tracked as a separate scope).
 *
 * Anon viewers see a "Sign in to create" disabled treatment instead
 * of being dumped at a create page they can't submit.
 */
function CreateCommunityCta({ isAnon }: { isAnon: boolean }) {
  if (isAnon) {
    return (
      <Link
        href={"/login" as Route}
        className="bcc-stencil inline-flex shrink-0 items-center gap-2 rounded-sm border-2 border-cardstock-edge/60 bg-cardstock/10 px-5 py-3 text-sm tracking-[0.12em] text-cardstock-deep transition hover:border-cardstock hover:text-cardstock"
        title="Sign in to create a community"
      >
        <span aria-hidden>＋</span>
        Sign in to create
      </Link>
    );
  }

  // V1.6 — in-app create flow at /communities/new. Internal Next
  // route, no target=_blank, no WP-host hop. The page handles the
  // POST /me/groups call + redirect-on-success.
  return (
    <Link
      href={"/communities/new" as Route}
      className="bcc-stencil inline-flex shrink-0 items-center gap-2 rounded-sm bg-safety px-5 py-3 text-sm tracking-[0.12em] text-cardstock transition hover:bg-ink"
    >
      <span aria-hidden>＋</span>
      Create community
    </Link>
  );
}

/**
 * No-JS chain picker: native <form method="GET"> auto-builds the URL
 * from form fields. Hidden inputs preserve the current scope so a
 * chain pick on /communities?mine=1 stays mine=1.
 */
function ChainDropdown({
  chain,
  scope,
}: {
  chain: string | null;
  scope: "all" | "verified" | "mine";
}) {
  return (
    <form
      method="GET"
      action="/communities"
      className="flex items-center gap-2"
    >
      {scope === "verified" && <input type="hidden" name="verified" value="1" />}
      {scope === "mine" && <input type="hidden" name="mine" value="1" />}
      <label
        htmlFor="communities-chain"
        className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep"
      >
        CHAIN
      </label>
      <select
        id="communities-chain"
        name="chain"
        defaultValue={chain ?? ""}
        className="bcc-mono rounded-full border border-cardstock-edge/40 bg-cardstock px-3 py-1.5 text-[11px] tracking-[0.16em] text-ink focus:outline-none focus:ring-2 focus:ring-blueprint"
      >
        <option value="">All chains</option>
        {COMMUNITY_CHAIN_CATALOG.map((opt) => (
          <option key={opt.slug} value={opt.slug}>
            {opt.label}
          </option>
        ))}
      </select>
      <button
        type="submit"
        className="bcc-mono rounded-full bg-ink px-3 py-1.5 text-[11px] tracking-[0.16em] text-cardstock transition hover:bg-safety"
      >
        APPLY
      </button>
      {chain !== null && (
        <Link
          href={buildCommunitiesHref({ scope, chain: null })}
          className="bcc-mono rounded-full border border-cardstock-edge/40 bg-cardstock px-2 py-1 text-[10px] tracking-[0.16em] text-ink-soft hover:border-cardstock-edge hover:text-ink"
        >
          CLEAR
        </Link>
      )}
    </form>
  );
}

function buildCommunitiesHref({
  scope,
  chain,
  page,
}: {
  scope: "all" | "verified" | "mine";
  chain: string | null;
  page?: number;
}): Route {
  const parts: string[] = [];
  if (scope === "verified") parts.push("verified=1");
  if (scope === "mine") parts.push("mine=1");
  if (chain !== null && chain !== "") parts.push(`chain=${encodeURIComponent(chain)}`);
  if (page !== undefined && page > 1) parts.push(`page=${page}`);
  return (parts.length === 0
    ? "/communities"
    : `/communities?${parts.join("&")}`) as Route;
}

function EmptyState({
  verifiedOnly,
  mineOnly,
  chain,
  isAnon,
}: {
  verifiedOnly: boolean;
  mineOnly: boolean;
  chain: string | null;
  isAnon: boolean;
}) {
  let label: string;
  let title: string;
  let body: string;

  const chainLabel = chain !== null
    ? (COMMUNITY_CHAIN_CATALOG.find((o) => o.slug === chain)?.label ?? chain)
    : null;

  if (mineOnly && isAnon) {
    label = "SIGN IN";
    title = "Sign in to see your communities.";
    body =
      "My communities lists every room you're a member of — sign in to surface them, " +
      "or browse All to see what's on the floor.";
  } else if (mineOnly && chain !== null) {
    label = "NO MEMBERSHIPS";
    title = `You're not in any ${chainLabel} communities yet.`;
    body =
      `Drop the chain filter to see every room you've joined, or browse ${chainLabel} from All to find one to join.`;
  } else if (mineOnly) {
    label = "NO MEMBERSHIPS";
    title = "You haven't joined anything yet.";
    body =
      "Hop into a room from All or Verified — once you join, it'll show up here for one-click access.";
  } else if (chain !== null && verifiedOnly) {
    label = "NO COMMUNITIES";
    title = `No verified ${chainLabel} communities yet.`;
    body =
      "Drop the chain filter or show all to see the rest of the floor.";
  } else if (chain !== null) {
    label = "NO COMMUNITIES";
    title = `No ${chainLabel} communities yet.`;
    body = "Pick a different chain or clear the filter to see what's on the floor.";
  } else if (verifiedOnly) {
    label = "NO COMMUNITIES";
    title = "No verified communities yet.";
    body =
      "Show all to see the rest of the floor — verified ones will surface here once collections are admin-approved.";
  } else {
    label = "NO COMMUNITIES";
    title = "No communities yet.";
    body = "First one's coming. Check back as the floor fills in.";
  }

  return (
    <div className="bcc-panel mx-auto max-w-xl p-8 text-center">
      <p className="bcc-mono text-safety">{label}</p>
      <h2 className="bcc-stencil mt-2 text-3xl text-ink">{title}</h2>
      <p className="mt-3 font-serif leading-relaxed text-ink-soft">{body}</p>
      {mineOnly && isAnon && (
        <p className="mt-5">
          <Link
            href={"/login" as Route}
            className="bcc-mono rounded-full bg-ink px-4 py-2 text-[11px] tracking-[0.16em] text-cardstock transition hover:bg-safety"
          >
            SIGN IN →
          </Link>
        </p>
      )}
    </div>
  );
}

function Pagination({
  verifiedOnly,
  mineOnly,
  chain,
  pagination,
}: {
  verifiedOnly: boolean;
  mineOnly: boolean;
  chain: string | null;
  pagination: GroupsDiscoveryPagination;
}) {
  const { page, total_pages } = pagination;
  const scope: "all" | "verified" | "mine" = mineOnly
    ? "mine"
    : verifiedOnly
    ? "verified"
    : "all";

  const buildHref = (target: number): Route =>
    buildCommunitiesHref({ scope, chain, page: target });

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

/**
 * Coerce a `?chain=` query param into an allowed slug, or null. Unknown
 * slugs collapse to null so a stale link can't bypass the dropdown
 * surface — the server already returns empty for unknown chains, but
 * normalizing here keeps the active-filter UI honest.
 */
function normalizeChainSlug(raw: string | undefined): string | null {
  if (typeof raw !== "string" || raw === "") return null;
  const match = COMMUNITY_CHAIN_CATALOG.find((opt) => opt.slug === raw);
  return match !== undefined ? match.slug : null;
}

