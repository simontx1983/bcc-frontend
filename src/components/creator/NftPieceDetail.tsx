"use client";

/**
 * NftPieceDetail — read-only V2 Phase 6 detail surface for one NFT.
 *
 * Consumes the §3.7 `NftPiece` view-model verbatim. No business logic:
 * every formatted string (`address_short`, `meta.indexer_state_label`,
 * `marketplace_links[].name`) comes from the server; the client renders
 * them as-is. No tier mapping, no rarity recomputation, no chain-token
 * symbol derivation.
 *
 * Why client component: the hero image swaps from `image_url_thumb`
 * (above-the-fold instant render) to `image_url` (full-res) once the
 * latter loads, and the address-copy CTAs use the clipboard API. The
 * static parts (description, attributes, marketplace links) would be
 * fine as a server component but the interactive bits dominate; one
 * boundary keeps the file simple.
 *
 * Reduced motion: image swap uses a no-op fade-in animation gated by
 * `usePrefersReducedMotion`. The fallback isn't a shorter animation —
 * it's a static swap (no transition at all). Same intent as the rest
 * of the codebase per `globals.css:115-121`.
 *
 * Memoised because parent server component re-renders on each
 * navigation; defensive even though V2 Phase 6 only renders this on
 * the dedicated detail route.
 */

import type { Route } from "next";
import Link from "next/link";
import { memo, useCallback, useEffect, useState } from "react";

import { Avatar } from "@/components/identity/Avatar";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import type {
  NftPiece,
  NftPieceAttribute,
  NftPieceCoOwner,
  NftPieceOwner,
} from "@/lib/api/types";

export interface NftPieceDetailProps {
  piece: NftPiece;
  /**
   * The `[slug]` segment from the route URL. Always populated from
   * the dynamic route segment — drives the back-breadcrumb to
   * `/c/{routeCreatorSlug}` so the user lands back on the same
   * creator profile they came from.
   */
  routeCreatorSlug: string;
}

function NftPieceDetailImpl({ piece, routeCreatorSlug }: NftPieceDetailProps) {
  const { collection, owner, owners, attributes, meta } = piece;

  // Fall-back rendering for null name (per §3.7: name is null when no
  // metadata yet — render `Untitled #{token_id}` rather than blank).
  const displayName = piece.name ?? `Untitled #${piece.token_id}`;

  // Back-breadcrumb: the URL's entry slug. Falls back to the server's
  // resolved handle only if the route segment was somehow empty (e.g.,
  // a server-rendered call-site that left it blank); the directory is
  // the final fallback when there is no creator handle anywhere.
  const backHref = pickBackHref(routeCreatorSlug, collection.creator_handle);
  const backLabel = collection.name ?? "Collection";

  // §3.6 indexer-state chip — render the SERVER label verbatim when
  // (a) the chain isn't healthy and (b) the label is non-empty.
  const chainState = meta.indexer_state[collection.chain_slug];
  const chainStateLabel = meta.indexer_state_label[collection.chain_slug];
  const showStateChip =
    chainState !== undefined &&
    chainState !== "healthy" &&
    chainStateLabel !== undefined &&
    chainStateLabel !== "";

  // Cosmos-asymmetry: read-time chains have no persistent owner yet on
  // cold cache. We surface a "Live data — owner lookup in progress"
  // placeholder ONLY when both conditions hold; otherwise null-owner
  // is the genuine "no holder known" state and we show nothing.
  const showLiveOwnerHint = owner === null && meta.read_time;

  return (
    <main className="mx-auto max-w-[1100px] px-7 pb-24 pt-12">
      {/* ── Header / breadcrumb row ─────────────────────────────── */}
      <header className="mb-8">
        <Link
          href={backHref}
          className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep transition hover:text-cardstock"
        >
          ← {backLabel.toUpperCase()}
        </Link>
        <div className="mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {collection.name !== null && (
            <span className="bcc-mono text-[11px] uppercase tracking-[0.16em] text-ink-soft/80">
              {collection.name}
            </span>
          )}
          <span className="bcc-mono text-[10px] text-ink-soft/60">
            #{piece.token_id}
          </span>
          {collection.is_verified && (
            <span
              className="bcc-mono inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.16em] text-blueprint"
              aria-label="Verified collection"
            >
              <span aria-hidden>◆</span>
              Verified
            </span>
          )}
        </div>
      </header>

      {/* ── Hero image + identity column ────────────────────────── */}
      <section className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,600px)_1fr]">
        <HeroImage
          imageUrl={piece.image_url}
          imageUrlThumb={piece.image_url_thumb}
          alt={displayName}
        />

        <div className="flex flex-col gap-6">
          <div>
            <h1 className="bcc-stencil text-3xl text-ink lg:text-4xl">
              {displayName}
            </h1>
            {piece.description !== null && (
              <p className="mt-4 font-serif text-base leading-relaxed text-ink-soft">
                {piece.description}
              </p>
            )}
          </div>

          {/* Indexer-state chip — server copy, verbatim. */}
          {showStateChip && (
            <div
              className="bcc-panel inline-flex items-center gap-2 self-start px-3 py-2"
              role="status"
            >
              <span aria-hidden className="bcc-mono text-[10px] text-ink-soft/70">
                ◇
              </span>
              <span className="bcc-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
                {chainStateLabel}
              </span>
            </div>
          )}

          {/* Owner block. */}
          {owner !== null && (
            <OwnerBlock
              owner={owner}
              ownersSummaryLabel={piece.meta.owners_summary_label}
            />
          )}
          {showLiveOwnerHint && (
            <div className="bcc-panel px-4 py-3" role="status">
              <p className="font-serif text-sm text-ink-soft">
                Live data &mdash; owner lookup in progress.
              </p>
            </div>
          )}

          {/* Marketplace links — render only when non-empty. */}
          {piece.marketplace_links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {piece.marketplace_links.map((link) => (
                <a
                  key={link.url}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bcc-stencil rounded-sm bg-ink px-4 py-2 text-[11px] tracking-[0.18em] text-cardstock transition hover:bg-ink-soft"
                >
                  Buy on {link.name}
                </a>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Attributes table — hide on empty per §3.7 ───────────── */}
      {attributes.length > 0 && (
        <section className="mt-12">
          <SectionRule label="Traits" />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {attributes.map((attr, idx) => (
              <li key={`${attr.trait_type}-${idx}`}>
                <AttributeTile attr={attr} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Co-owners (ERC-1155 only) ───────────────────────────── */}
      {owners.length > 0 && (
        <section className="mt-12">
          <SectionRule label="Held by" />
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {owners.map((coOwner) => (
              <li key={coOwner.wallet_address}>
                <CoOwnerTile coOwner={coOwner} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

/**
 * Hero image with thumb→full swap on load. Reduced-motion: no fade,
 * direct swap (the still-image is identical either way; the fade is
 * pure animation — its absence is the static fallback the §A2 rule
 * asks for).
 */
function HeroImage({
  imageUrl,
  imageUrlThumb,
  alt,
}: {
  imageUrl: string | null;
  imageUrlThumb: string | null;
  alt: string;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [fullLoaded, setFullLoaded] = useState(false);

  // Reset the loaded flag if the URL changes (route nav between two
  // pieces under the same component instance — Next 15 keeps client
  // components mounted across same-segment navigations).
  useEffect(() => {
    setFullLoaded(false);
  }, [imageUrl]);

  const onFullLoad = useCallback(() => {
    setFullLoaded(true);
  }, []);

  // Both null → tier-toned placeholder.
  if (imageUrl === null && imageUrlThumb === null) {
    return (
      <div
        className="bcc-panel flex aspect-square w-full items-center justify-center bg-cardstock-deep/30"
        aria-label={alt}
      >
        <span className="bcc-mono text-[11px] uppercase tracking-[0.18em] text-ink-soft/60">
          No artwork
        </span>
      </div>
    );
  }

  // Single URL — render directly, no swap dance.
  const onlyOne = imageUrl === null || imageUrlThumb === null;
  if (onlyOne) {
    const src = imageUrl ?? imageUrlThumb;
    return (
      <div className="bcc-panel relative aspect-square w-full overflow-hidden bg-cardstock-deep/30">
        {/* eslint-disable-next-line @next/next/no-img-element -- remote NFT CDN URLs without a domain allowlist for next/image */}
        <img
          src={src ?? ""}
          alt={alt}
          className="h-full w-full object-cover"
          loading="eager"
          decoding="async"
        />
      </div>
    );
  }

  // Both present → render thumb, layer full on top, fade in once full
  // is loaded. Reduced-motion: swap with no transition.
  return (
    <div className="bcc-panel relative aspect-square w-full overflow-hidden bg-cardstock-deep/30">
      {/* eslint-disable-next-line @next/next/no-img-element -- remote NFT CDN URLs without a domain allowlist for next/image */}
      <img
        src={imageUrlThumb}
        alt={alt}
        className="absolute inset-0 h-full w-full object-cover"
        loading="eager"
        decoding="async"
        aria-hidden={fullLoaded}
      />
      {/* eslint-disable-next-line @next/next/no-img-element -- remote NFT CDN URLs without a domain allowlist for next/image */}
      <img
        src={imageUrl}
        alt={alt}
        onLoad={onFullLoad}
        className={
          "absolute inset-0 h-full w-full object-cover " +
          (reducedMotion
            ? fullLoaded
              ? "opacity-100"
              : "opacity-0"
            : fullLoaded
              ? "opacity-100 transition-opacity duration-300"
              : "opacity-0 transition-opacity duration-300")
        }
        loading="eager"
        decoding="async"
      />
    </div>
  );
}

/**
 * Dominant-owner row. Links to `/u/{owner.user.handle}` when the
 * wallet is BCC-linked; renders wallet-only otherwise.
 */
function OwnerBlock({
  owner,
  ownersSummaryLabel,
}: {
  owner: NftPieceOwner;
  ownersSummaryLabel: string | null;
}) {
  const linkedUser = owner.is_linked ? owner.user : null;

  return (
    <div className="bcc-panel flex flex-col gap-3 px-4 py-3">
      <span className="bcc-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft/60">
        Owner
      </span>
      <div className="flex items-center gap-3">
        {linkedUser !== null ? (
          <Link
            href={`/u/${linkedUser.handle}` as Route}
            className="flex items-center gap-3 text-ink transition hover:text-blueprint"
          >
            {/*
              Sprint 1 Identity Grammar — consolidated to the shared
              <Avatar>. Previous local Avatar derived a per-user HSL hue
              for the initials background (intentional cohesion-loss
              for the global identity grammar; see GroupMembersStrip).
            */}
            <Avatar
              avatarUrl={linkedUser.avatar_url === "" ? null : linkedUser.avatar_url}
              handle={linkedUser.handle}
              displayName={linkedUser.display_name}
              size="md"
              variant="rounded"
            />
            <div className="flex flex-col">
              <span className="bcc-stencil text-base">{linkedUser.display_name}</span>
              <span className="bcc-mono text-[10px] text-ink-soft/70">
                @{linkedUser.handle} &middot; {owner.address_short}
              </span>
            </div>
          </Link>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar
              avatarUrl={null}
              handle={owner.address_short}
              displayName={null}
              size="md"
              variant="rounded"
            />
            <div className="flex flex-col">
              <span className="bcc-mono text-[12px] text-ink">{owner.address_short}</span>
              <span className="bcc-mono text-[10px] text-ink-soft/60">
                Unlinked wallet
              </span>
            </div>
          </div>
        )}
      </div>
      {ownersSummaryLabel !== null && (
        <span className="bcc-mono text-[10px] text-ink-soft/70">
          {ownersSummaryLabel}
        </span>
      )}
    </div>
  );
}

/**
 * Co-owner tile (ERC-1155 only). Wallet-only per §3.7 privacy redaction.
 */
function CoOwnerTile({ coOwner }: { coOwner: NftPieceCoOwner }) {
  return (
    <div className="bcc-panel flex flex-col gap-1 px-3 py-2">
      <span className="bcc-mono text-[11px] text-ink">{coOwner.address_short}</span>
      <span className="bcc-mono text-[9px] text-ink-soft/60">
        balance {coOwner.balance}
      </span>
    </div>
  );
}

function AttributeTile({ attr }: { attr: NftPieceAttribute }) {
  return (
    <div className="bcc-panel flex flex-col gap-1 px-3 py-2">
      <span className="bcc-mono text-[9px] uppercase tracking-[0.16em] text-ink-soft/60">
        {attr.trait_type}
      </span>
      <span className="bcc-stencil truncate text-sm text-ink" title={String(attr.value)}>
        {String(attr.value)}
      </span>
      {attr.rarity_pct !== undefined && (
        <span className="bcc-mono text-[9px] text-ink-soft/70">
          ({attr.rarity_pct}%)
        </span>
      )}
    </div>
  );
}

function SectionRule({ label }: { label: string }) {
  return (
    <div className="bcc-mono mb-5 flex items-center gap-3 text-cardstock-deep">
      <span className="inline-block h-px w-8 bg-cardstock-edge/50" />
      <span className="text-[10px] tracking-[0.24em]">
        {label.toUpperCase()}
      </span>
      <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Local primitives — kept inline rather than extracted because each
// has exactly one consumer in V2 Phase 6 and the §A2 reuse rule asks
// us NOT to introduce premature abstractions. If a second consumer
// lands (e.g., a piece-card in a feed list), promote to /components/ui.
// ─────────────────────────────────────────────────────────────────────


function pickBackHref(routeSlug: string, collectionHandle: string | null): Route {
  // Prefer the route's entry slug (the user clicked from /c/{routeSlug});
  // fall back to the server's resolved handle when the route segment
  // is empty; final fallback is the directory (no creator handle
  // anywhere → don't deep-link to a route that 404s).
  if (routeSlug !== "") {
    return `/c/${routeSlug}` as Route;
  }
  if (collectionHandle !== null && collectionHandle !== "") {
    return `/c/${collectionHandle}` as Route;
  }
  return "/directory" as Route;
}

export const NftPieceDetail = memo(NftPieceDetailImpl);
