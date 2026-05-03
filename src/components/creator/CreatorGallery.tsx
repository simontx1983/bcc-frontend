"use client";

/**
 * CreatorGallery — §H1 NFT gallery surface for the creator profile.
 *
 * Reads from `useCreatorGallery` and renders a responsive grid of
 * collection tiles. Each tile shows the cover image, name, native
 * floor price, and chain badge. Click → external explorer URL.
 *
 * Per §A2/§L5, every formatted string (`floor_price_label`,
 * `total_volume_label`, `unique_holders_label`) comes from the
 * server. The component renders verbatim — no chain-token mapping,
 * no `Intl.NumberFormat`, no derivation.
 *
 * States:
 *   - loading-initial → skeleton row
 *   - error           → silent panel ("couldn't load")
 *   - empty (creator has no indexed collections yet)
 *                     → "Coming soon" panel referencing the SWR hint
 *   - empty + stale   → "Pulling from-chain… check back shortly"
 *   - has-data        → grid + (if stale) a soft "Refreshing…" badge
 *                       + Load more button when has_more
 *
 * The empty + stale path is the dominant first-time experience for
 * a creator whose page just got claimed: the server's first read
 * dispatches a refresh, the user sees a placeholder, and the next
 * page-load lights up the grid.
 */

import { useCreatorGallery } from "@/hooks/useCreatorGallery";
import type { CreatorGalleryItem } from "@/lib/api/types";

interface CreatorGalleryProps {
  slug: string;
  /** Used for the empty-state copy ("Welder hasn't dropped anything yet"). */
  creatorName: string;
}

export function CreatorGallery({ slug, creatorName }: CreatorGalleryProps) {
  const query = useCreatorGallery({ slug });

  if (query.isError) {
    return (
      <GalleryShell title="The Gallery">
        <div className="bcc-panel mx-auto max-w-md p-6 text-center">
          <p className="font-serif text-sm text-ink-soft">
            Couldn&rsquo;t load this creator&rsquo;s gallery right now. Try again in a moment.
          </p>
        </div>
      </GalleryShell>
    );
  }

  if (query.isLoading) {
    return (
      <GalleryShell title="The Gallery">
        <ul
          aria-label="Loading gallery"
          className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        >
          {Array.from({ length: 6 }).map((_, idx) => (
            <li
              key={idx}
              aria-hidden
              className="bcc-panel aspect-square animate-pulse opacity-40"
            />
          ))}
        </ul>
      </GalleryShell>
    );
  }

  const pages = query.data?.pages ?? [];
  const items: CreatorGalleryItem[] = pages.flatMap((p) => p.items);
  const isStale = pages[0]?.is_stale ?? false;
  const totalCount = pages[0]?.pagination.total ?? 0;

  if (items.length === 0) {
    return (
      <GalleryShell title="The Gallery">
        <div className="bcc-panel mx-auto max-w-lg p-8 text-center">
          <h3 className="bcc-stencil text-2xl text-ink">
            {isStale ? "Pulling from-chain…" : "Coming soon"}
          </h3>
          <p className="mt-2 font-serif text-ink-soft">
            {isStale
              ? `We&rsquo;re indexing ${creatorName}&rsquo;s collections now. Check back in a minute or two.`
              : `${creatorName} hasn&rsquo;t dropped anything yet. When they do, the work shows up here.`}
          </p>
        </div>
      </GalleryShell>
    );
  }

  const subtitle = totalCount > 0
    ? `${totalCount} collection${totalCount === 1 ? "" : "s"}${isStale ? " · refreshing" : ""}`
    : undefined;

  return (
    <GalleryShell
      title="The Gallery"
      {...(subtitle !== undefined ? { subtitle } : {})}
    >
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((item) => (
          <li key={`${item.chain_slug}-${item.id}`}>
            <CollectionTile item={item} />
          </li>
        ))}
      </ul>

      {query.hasNextPage && (
        <div className="mt-6 flex justify-center">
          <button
            type="button"
            onClick={() => void query.fetchNextPage()}
            disabled={query.isFetchingNextPage}
            className={
              "bcc-stencil rounded-sm px-6 py-3 text-[12px] tracking-[0.2em] transition " +
              (query.isFetchingNextPage
                ? "cursor-wait bg-cardstock-deep/40 text-ink-soft/60"
                : "bg-ink text-cardstock hover:bg-ink-soft")
            }
          >
            {query.isFetchingNextPage ? "LOADING…" : "LOAD MORE"}
          </button>
        </div>
      )}
    </GalleryShell>
  );
}

interface GalleryShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

function GalleryShell({ title, subtitle, children }: GalleryShellProps) {
  return (
    <section className="mx-auto mt-12 max-w-[1560px] px-7">
      <div className="bcc-mono mb-4 flex items-center gap-3 text-cardstock-deep">
        <span className="inline-block h-px w-8 bg-cardstock-edge/50" />
        <span>{title}</span>
        {subtitle !== undefined && (
          <span className="bcc-mono text-[10px] tracking-[0.16em] text-ink-soft/70">
            · {subtitle}
          </span>
        )}
        <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
      </div>
      {children}
    </section>
  );
}

interface CollectionTileProps {
  item: CreatorGalleryItem;
}

function CollectionTile({ item }: CollectionTileProps) {
  const href = item.explorer_url;

  const inner = (
    <article className="bcc-panel flex h-full flex-col overflow-hidden">
      <div
        className="relative aspect-square w-full bg-cardstock-deep/30"
        style={{
          backgroundImage: item.image_url !== null ? `url(${item.image_url})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
        }}
      >
        {item.image_url === null && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="bcc-mono text-[10px] tracking-[0.18em] text-ink-soft/60">
              NO COVER
            </span>
          </div>
        )}
        <span
          className="bcc-mono absolute right-2 top-2 rounded-sm px-2 py-0.5 text-[9px] tracking-[0.18em]"
          style={{
            background: "rgba(15,13,9,0.72)",
            color: "var(--cardstock)",
          }}
        >
          {item.chain_name.toUpperCase()}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="bcc-stencil truncate text-base text-ink" title={item.name}>
          {item.name}
        </h3>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {item.floor_price_label !== null && (
            <span className="bcc-mono text-[11px] text-ink">
              <span className="text-ink-soft/70">FLOOR</span> {item.floor_price_label}
            </span>
          )}
          {item.unique_holders_label !== null && (
            <span className="bcc-mono text-[10px] text-ink-soft/70">
              {item.unique_holders_label}
            </span>
          )}
        </div>
        {item.total_volume_label !== null && (
          <span className="bcc-mono text-[10px] text-ink-soft/70">
            {item.total_volume_label}
          </span>
        )}
      </div>
    </article>
  );

  if (href === null) {
    return inner;
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="block h-full transition hover:-translate-y-0.5"
      aria-label={`View ${item.name} on ${item.chain_name} explorer`}
    >
      {inner}
    </a>
  );
}
