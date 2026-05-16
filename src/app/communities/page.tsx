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
 * Click-through (V1):
 *   - type === "local" → /locals/[slug] (existing detail route)
 *   - type === "nft"   → /settings/communities (where Join lives)
 *   - type === "user" | "system" + privacy === "open" → no link;
 *     inline JOIN button wires §4.7.3 plain group join. The card stops
 *     sliding on hover so the button stays reachable.
 *   - type === "user" | "system" + privacy === "closed" → no link,
 *     no action (display-only). PeepSo's request-to-join flow lives
 *     on the group page itself; we don't replicate it.
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";

import { authOptions } from "@/lib/auth";
import { getGroupsDiscovery } from "@/lib/api/groups-discovery-endpoints";
import { COMMUNITY_CHAIN_CATALOG } from "@/lib/communities/chain-catalog";
import { CommunityCover } from "@/components/communities/CommunityCover";
import { FlippableNftCard } from "@/components/communities/FlippableNftCard";
import { JoinPlainGroupButton } from "@/components/communities/JoinPlainGroupButton";
import { HeatBadge } from "@/components/groups/HeatBadge";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import type {
  GroupDiscoveryItem,
  GroupsDiscoveryPagination,
} from "@/lib/api/types";

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
  const token = session?.bccToken ?? null;

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
    fetchError = err instanceof Error ? err.message : "Couldn't load communities.";
  }

  const items = result?.items ?? [];
  const pagination = result?.pagination ?? null;
  const isAnon = session === null;

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-6xl px-6 pt-12 sm:px-8">
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
      <section className="mx-auto mt-8 max-w-6xl px-6 sm:px-8">
        <ChainDropdown
          chain={chain}
          scope={mineOnly ? "mine" : verifiedOnly ? "verified" : "all"}
        />
      </section>

      <section className="mx-auto mt-4 max-w-6xl px-6 sm:px-8">
        <FilterStrip
          verifiedOnly={verifiedOnly}
          mineOnly={mineOnly}
          chain={chain}
        />
      </section>

      <section className="mx-auto mt-6 max-w-6xl px-6 sm:px-8">
        {fetchError !== null ? (
          <p role="alert" className="bcc-mono text-safety">
            Couldn&apos;t load communities: {fetchError}
          </p>
        ) : items.length === 0 ? (
          <EmptyState
            verifiedOnly={verifiedOnly}
            mineOnly={mineOnly}
            chain={chain}
            isAnon={isAnon}
          />
        ) : (
          <CommunitiesGrid items={items} />
        )}
      </section>

      {pagination !== null && pagination.total_pages > 1 && (
        <section className="mx-auto mt-8 max-w-6xl px-6 sm:px-8">
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

function CommunitiesGrid({ items }: { items: GroupDiscoveryItem[] }) {
  return (
    <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.group_id}>
          <CommunityCard item={item} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Square card with a full-bleed cover (image or generated initials)
 * and a cream info panel pinned to the bottom half. On hover the panel
 * slides down off the card to reveal the full cover. Reduced-motion
 * users keep the panel in place — `motion-safe:` gates both the
 * transition AND the transform, so no movement happens at all when
 * the OS preference is set.
 */
function CommunityCard({ item }: { item: GroupDiscoveryItem }) {
  const link = clickThroughHref(item);

  // NFT cards with market-data carry the flip-to-back UX. The flip
  // surfaces decision-grade signals (floor / holders / volume) before
  // the user clicks through to /settings/communities to actually join.
  // FlippableNftCard accepts an internal Route — NFT routing today is
  // always internal so this cast is contract-safe.
  if (
    item.type === "nft" &&
    item.collection_stats !== null &&
    link !== null &&
    !link.external
  ) {
    return <FlippableNftCard item={item} href={link.url as Route} />;
  }

  const joinable = isPlainGroupJoinable(item);
  const baseClass =
    "group relative block aspect-square overflow-hidden border-2 border-cardstock-edge/40 bg-cardstock-deep/40";
  // Focus ring lives on the link wrappers only (the static <div> branch
  // isn't focusable). Cream + offset against the dark site bg keeps the
  // outline legible against arbitrary NFT artwork once the panel slides
  // off — `focus-visible:` so it doesn't appear on click-only.
  const linkClass =
    baseClass +
    " focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cardstock focus-visible:ring-offset-2 focus-visible:ring-offset-ink";

  // Joinable plain-group cards keep the panel pinned so the inline
  // JOIN button stays clickable on hover. Other cards keep the
  // slide-off reveal (cover art shows through on hover).
  const panelMotionClass = joinable
    ? ""
    : " motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover:translate-y-full motion-safe:group-focus-visible:translate-y-full";

  const inner = (
    <>
      <CommunityCover
        imageUrl={item.image_url}
        name={item.name}
        groupId={item.group_id}
      />
      <div
        className={
          // `translate-y-0` initializes the --tw-translate-* CSS vars
          // so the conditional `group-hover:translate-y-full` rule
          // produces a valid `transform` shorthand. Without it Tailwind
          // emits `translate(, 100%)` which the browser drops as invalid.
          "absolute inset-x-0 bottom-0 h-1/2 bg-cardstock px-5 py-4 translate-y-0" +
          panelMotionClass
        }
      >
        <CardBody item={item} />
      </div>
    </>
  );

  if (link === null) {
    return <div className={baseClass}>{inner}</div>;
  }

  // External URLs (plain user/system groups → PeepSo's group page on
  // the WP host) need a plain anchor; Next's <Link> is typed-routes
  // only and would reject the cross-origin URL at compile time.
  // `target="_blank"` because the PeepSo group page is a different
  // app shell — opening in-tab would lose the /communities context.
  if (link.external) {
    return (
      <a
        href={link.url}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
      >
        {inner}
      </a>
    );
  }

  return (
    <Link href={link.url as Route} className={linkClass}>
      {inner}
    </Link>
  );
}

function CardBody({ item }: { item: GroupDiscoveryItem }) {
  // Phase γ UX cleanup: surface the kind + accessibility-of-join as two
  // small chips so users can distinguish HOLDERS (NFT-gated) vs LOCAL
  // (chain-bound) vs OPEN (plain group, anyone can join) vs CLOSED
  // (request-to-join, not handled in this surface) at a glance.
  // accessibilityLabel is null for NFT/Local types where the join
  // mechanic is implicit in the kind itself.
  const accessibilityLabel = privacyChipLabel(item);
  const chainLabel =
    item.chain_tag !== null
      ? COMMUNITY_CHAIN_CATALOG.find((o) => o.slug === item.chain_tag)?.label ??
        item.chain_tag.toUpperCase()
      : null;
  // Kind on the left composes with the chain tag when present, so the
  // viewer sees "GROUP · STARGAZE" instead of just "GROUP." Kind sits
  // first because it answers "what kind of room is this?"; chain
  // answers "which chain?" — read left-to-right.
  const kindWithChain =
    chainLabel !== null
      ? `${kindLabel(item.type)} · ${chainLabel.toUpperCase()}`
      : kindLabel(item.type);

  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
          {kindWithChain}
        </span>
        {accessibilityLabel !== null && (
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
            {accessibilityLabel}
          </span>
        )}
      </div>

      <h2 className="bcc-stencil mt-2 line-clamp-2 text-lg text-ink">
        {item.name}
      </h2>

      {item.verification !== null && (
        <p className="bcc-mono mt-2 text-[10px]">
          <VerificationBadge label={item.verification.label} />
        </p>
      )}

      <div className="mt-2 flex items-center justify-between">
        <span className="bcc-mono text-[10px] text-ink-soft">
          {item.member_count.toLocaleString()} member{item.member_count === 1 ? "" : "s"}
        </span>
        <HeatBadge activity={item.activity} />
      </div>

      {isPlainGroupJoinable(item) && (
        // The surrounding card is now a clickable link (PeepSo group
        // page for plain groups). The JOIN button's own handler stops
        // propagation inside GroupActionButton so clicking JOIN fires
        // the mutation without ALSO following the card link.
        <div className="mt-3 flex justify-end">
          <JoinPlainGroupButton groupId={item.group_id} />
        </div>
      )}
    </>
  );
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

function kindLabel(type: GroupDiscoveryItem["type"]): string {
  switch (type) {
    case "nft":    return "HOLDERS";
    case "local":  return "LOCAL";
    case "system": return "SYSTEM";
    case "user":   return "GROUP";
  }
}

/**
 * Secondary chip that names the join model alongside the kind label.
 *
 *   - Trust-gated groups → "TRUST <N>+" (subsumes OPEN — trust groups
 *     run on PeepSo's open privacy under the hood, so without this
 *     branch they'd render as plain OPEN and the gate would be invisible)
 *   - Plain groups (user/system) + privacy === "open"   → "OPEN"
 *   - Plain groups (user/system) + privacy === "closed" → "CLOSED"
 *   - NFT holder groups and Locals → null (the kind label HOLDERS / LOCAL
 *     already communicates the gating model; doubling it up is noise)
 *
 * Phase γ UX cleanup: previously only CLOSED was rendered; OPEN was the
 * implicit default. Surfacing all four states makes the directory
 * scannable for a viewer who doesn't yet know which rooms they can walk
 * straight into.
 */
function privacyChipLabel(item: GroupDiscoveryItem): string | null {
  if (item.trust_min !== null) return `TRUST ${item.trust_min}+`;
  if (item.type !== "user" && item.type !== "system") return null;
  if (item.privacy === "closed") return "CLOSED";
  if (item.privacy === "open")   return "OPEN";
  return null;
}

/**
 * Per-type click-through. Tagged with `external` so the card wrapper
 * picks the right element (`<Link>` for internal Next routes,
 * `<a target="_blank">` for cross-host pages).
 *
 * V1.6 routing — every kind now has a native Next page:
 *   - local        → /locals/[slug]        (existing Local surface)
 *   - nft          → /communities/[slug]   (NEW unified detail page)
 *   - user/system  → /communities/[slug]   (NEW unified detail page)
 *
 * The /communities/[slug] page mounts `GroupDetailShell` (FileRail +
 * PageHero with GroupCard + GroupMembershipStrip in the actions slot +
 * GroupTabs over Stream / Members / About). The shared shell already
 * speaks the §4.7.5 GroupDetailResponse view-model, so a single
 * shell handles all four kinds across /communities, /groups, /locals. NFT cards route here instead of
 * /settings/communities so the discovery → detail → join flow stays
 * in-app; /settings/communities remains the source of truth for the
 * holder-set management surface.
 *
 * Returns null only when slug is missing — defensive; the discovery
 * endpoint always emits one. The card renders a non-clickable shell
 * in that pathological case rather than a dead link.
 */
function clickThroughHref(item: GroupDiscoveryItem):
  | { url: string; external: boolean }
  | null {
  if (item.slug === "") return null;

  if (item.type === "local") {
    return {
      url: `/locals/${encodeURIComponent(item.slug)}`,
      external: false,
    };
  }

  return {
    url: `/communities/${encodeURIComponent(item.slug)}`,
    external: false,
  };
}

/**
 * Plain (non-NFT, non-Local) groups whose privacy allows a direct join.
 * Closed/secret groups are server-rejected with a hint pointing at
 * PeepSo's request-flow page (§4.7.3) — we don't replicate that UI.
 */
function isPlainGroupJoinable(item: GroupDiscoveryItem): boolean {
  return (item.type === "user" || item.type === "system") && item.privacy === "open";
}
