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
    page?: string;
  }>;
}

export default async function CommunitiesDiscoveryPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const verifiedOnly = params.verified === "1";
  const page = clampPage(params.page);

  const session = await getServerSession(authOptions);
  const token = session?.bccToken ?? null;

  let result;
  let fetchError: string | null = null;
  try {
    result = await getGroupsDiscovery(
      { verified: verifiedOnly, page, page_size: 24 },
      token
    );
  } catch (err) {
    result = null;
    fetchError = err instanceof Error ? err.message : "Couldn't load communities.";
  }

  const items = result?.items ?? [];
  const pagination = result?.pagination ?? null;

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-6xl px-6 pt-12 sm:px-8">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          DISCOVERY · COMMUNITIES
        </span>
        <h1 className="bcc-stencil mt-2 text-5xl text-cardstock md:text-6xl">
          Communities
        </h1>
        <p className="mt-3 max-w-2xl font-serif text-lg text-cardstock-deep">
          Active rooms across the floor. On-chain verified communities
          rank first, then warmest, then largest — so you see the rooms
          worth walking into, not the dead ones.
        </p>
      </section>

      <section className="mx-auto mt-8 max-w-6xl px-6 sm:px-8">
        <VerifiedFilterStrip verifiedOnly={verifiedOnly} />
      </section>

      <section className="mx-auto mt-6 max-w-6xl px-6 sm:px-8">
        {fetchError !== null ? (
          <p role="alert" className="bcc-mono text-safety">
            Couldn&apos;t load communities: {fetchError}
          </p>
        ) : items.length === 0 ? (
          <EmptyState verifiedOnly={verifiedOnly} />
        ) : (
          <CommunitiesGrid items={items} />
        )}
      </section>

      {pagination !== null && pagination.total_pages > 1 && (
        <section className="mx-auto mt-8 max-w-6xl px-6 sm:px-8">
          <Pagination verifiedOnly={verifiedOnly} pagination={pagination} />
        </section>
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function VerifiedFilterStrip({ verifiedOnly }: { verifiedOnly: boolean }) {
  const filters: ReadonlyArray<{ value: boolean; label: string }> = [
    { value: false, label: "All" },
    { value: true,  label: "On-Chain Verified" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2">
      {filters.map((filter) => {
        const isActive = filter.value === verifiedOnly;
        const href = (filter.value
          ? "/communities?verified=1"
          : "/communities") as Route;
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
  const href = clickThroughHref(item);

  // NFT cards with market-data carry the flip-to-back UX. The flip
  // surfaces decision-grade signals (floor / holders / volume) before
  // the user clicks through to /settings/communities to actually join.
  // Non-NFT kinds and NFT cards missing stats fall through to the
  // existing layout below.
  if (item.type === "nft" && item.collection_stats !== null && href !== null) {
    return <FlippableNftCard item={item} href={href} />;
  }

  const joinable = isPlainGroupJoinable(item);
  const baseClass =
    "group relative block aspect-square overflow-hidden border-2 border-cardstock-edge/40 bg-cardstock-deep/40";
  // Focus ring lives on the Link only (the static <div> branch isn't
  // focusable). Cream + offset against the dark site bg keeps the
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

  if (href === null) {
    return <div className={baseClass}>{inner}</div>;
  }

  return (
    <Link href={href} className={linkClass}>
      {inner}
    </Link>
  );
}

function CardBody({ item }: { item: GroupDiscoveryItem }) {
  return (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
          {kindLabel(item.type)}
        </span>
        {item.privacy === "closed" && (
          <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
            CLOSED
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
        <div className="mt-3 flex justify-end">
          <JoinPlainGroupButton groupId={item.group_id} />
        </div>
      )}
    </>
  );
}

function EmptyState({ verifiedOnly }: { verifiedOnly: boolean }) {
  return (
    <div className="bcc-panel mx-auto max-w-xl p-8 text-center">
      <p className="bcc-mono text-safety">NO COMMUNITIES</p>
      <h2 className="bcc-stencil mt-2 text-3xl text-ink">
        {verifiedOnly
          ? "No on-chain verified communities yet."
          : "No communities yet."}
      </h2>
      <p className="mt-3 font-serif leading-relaxed text-ink-soft">
        {verifiedOnly
          ? "Show all to see the rest of the floor — verified ones will surface here once collections are admin-approved."
          : "First one's coming. Check back as the floor fills in."}
      </p>
    </div>
  );
}

function Pagination({
  verifiedOnly,
  pagination,
}: {
  verifiedOnly: boolean;
  pagination: GroupsDiscoveryPagination;
}) {
  const { page, total_pages } = pagination;
  const baseQuery = verifiedOnly ? "verified=1" : "";

  const buildHref = (target: number): Route => {
    const parts: string[] = [];
    if (baseQuery !== "") parts.push(baseQuery);
    parts.push(`page=${target}`);
    return `/communities?${parts.join("&")}` as Route;
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

function kindLabel(type: GroupDiscoveryItem["type"]): string {
  switch (type) {
    case "nft":    return "HOLDERS";
    case "local":  return "LOCAL";
    case "system": return "SYSTEM";
    case "user":   return "GROUP";
  }
}

/**
 * Per-type click-through. V1: only kinds with a dedicated detail
 * surface get a link. NFT-gated holder groups deep-link to the
 * settings tab where the Join action actually lives — anonymous users
 * get an auth redirect from middleware as a side effect.
 *
 * `user`/`system` cards never use a link wrapper (the entire card
 * being a Link would interfere with the inline JOIN button on
 * joinable rows and there's no detail page anyway).
 */
function clickThroughHref(item: GroupDiscoveryItem): Route | null {
  switch (item.type) {
    case "local":
      return `/locals/${encodeURIComponent(item.slug)}` as Route;
    case "nft":
      return "/settings/communities" as Route;
    case "system":
    case "user":
      return null;
  }
}

/**
 * Plain (non-NFT, non-Local) groups whose privacy allows a direct join.
 * Closed/secret groups are server-rejected with a hint pointing at
 * PeepSo's request-flow page (§4.7.3) — we don't replicate that UI.
 */
function isPlainGroupJoinable(item: GroupDiscoveryItem): boolean {
  return (item.type === "user" || item.type === "system") && item.privacy === "open";
}
