"use client";

/**
 * BinderTile — slim per-item panel rendered from the §C2 binder row.
 *
 * Why not CardFactory: the binder API is identifier-only by design
 * (no trust/tier/stats/crest). Re-fetching every card's view-model
 * to render a full CardFactory would be N+1; binder reads stay fast.
 * Tiles are smaller, identity-focused, and link out to /v/:slug etc.
 * for the full card.
 *
 * What's surfaced:
 *   - kind band — color-coded per card_kind
 *   - mini hex crest using initials derived from card_handle
 *   - handle + card_tier_at_pull badge (server-canonical, snapshot at pull time)
 *   - relative pulled_at (suppressed when is_legacy — those aren't
 *     real pull moments per the locked is_legacy contract)
 *   - unpull button (DELETE /me/binder/:follow_id)
 *
 * Click-through: the entire panel routes to `links.card` via Next's
 * <Link>. The unpull button stops propagation so it doesn't navigate.
 */

import type { Route } from "next";
import Link from "next/link";
import { type MouseEvent } from "react";

import { useUnpullMutation } from "@/hooks/useBinderPull";
import { formatRelativeTime } from "@/lib/format";
import { deriveInitials } from "@/lib/format/initials";
import type { BinderItem, CardKind } from "@/lib/api/types";

export interface BinderTileProps {
  item: BinderItem;
  /** Drives the optimistic "Removing…" state on the unpull button. */
  isUnpulling?: boolean;
}

/** Kind → chain-color CSS variable (matches CardFactory's chain band). */
const KIND_COLORS: Record<CardKind, string> = {
  validator: "var(--chain-cosmos)",
  project:   "var(--chain-injective)",
  creator:   "var(--chain-osmosis)",
  member:    "var(--blueprint)",
};

export function BinderTile({ item, isUnpulling = false }: BinderTileProps) {
  const unpullMut = useUnpullMutation();

  const handleUnpull = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    unpullMut.mutate({
      follow_id: item.follow_id,
      source: item.follow_source ?? "peepso",
    });
  };

  // Sprint 1 Identity Grammar: deriveInitials now lives in the shared
  // helper at lib/format/initials.ts. The BinderTile crest itself is
  // a Sprint-1-deferred consolidation candidate — its hex crest +
  // kind-band framing is binder-specific chrome that would push scope
  // into the cosmetic layer. Promote to <Avatar variant="hex" size="xl"
  // tier={card_tier_at_pull}> when the binder visual refresh lands.
  const initials = deriveInitials(null, item.card_handle) || "BC";
  const kindColor = KIND_COLORS[item.card_kind];
  const cardHref = item.links.card as Route;

  return (
    <Link
      href={cardHref}
      className="group bcc-panel relative flex h-[260px] w-full max-w-[calc(50vw-1rem)] flex-col overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blueprint sm:w-[180px] sm:max-w-none"
      style={{ ["--bcc-chain-color" as string]: kindColor }}
    >
      {/* Kind band — color-coded, with the kind label */}
      <div
        className="bcc-stencil flex h-9 items-center justify-between border-b-[2px] border-ink px-3 text-xs text-white"
        style={{ background: kindColor }}
      >
        <span className="tracking-[0.12em]">{item.card_kind.toUpperCase()}</span>
        {item.is_legacy && (
          <span
            title="Imported entry — no original Keep Tabs moment"
            className="bcc-mono px-1.5 py-0.5 text-[8px] text-white/70"
          >
            LEGACY
          </span>
        )}
      </div>

      {/* Crest — hex with initials. Reuses globals.css .bcc-hex layers. */}
      <div className="relative flex flex-1 items-center justify-center bg-cardstock-deep/30">
        <div className="bcc-hex h-[110px] w-[100px] drop-shadow-[0_4px_6px_rgba(0,0,0,0.4)]">
          <span aria-hidden className="bcc-hex-outer" />
          <span aria-hidden className="bcc-hex-mid" />
          <span aria-hidden className="bcc-hex-inner" />
          <span className="bcc-stencil relative z-[2] text-3xl text-ink">{initials}</span>
        </div>
      </div>

      {/* Handle + tier + pulled date. Both color (`--tier-{key}`) and
          label come from server-canonical fields per §A2 — the tile
          never derives them from reputation tier. */}
      <div className="border-t border-cardstock-edge/40 bg-cardstock px-3 py-2">
        <p className="bcc-mono truncate text-xs text-ink">@{item.card_handle}</p>
        <div className="mt-1 flex items-center justify-between gap-2">
          <span
            className="bcc-mono text-[9px] tracking-[0.14em]"
            style={{
              color:
                item.card_tier_at_pull !== null
                  ? `var(--tier-${item.card_tier_at_pull})`
                  : "var(--ink-soft)",
            }}
          >
            {item.tier_label_at_pull ?? "—"}
          </span>
          {!item.is_legacy && item.pulled_at !== null && (
            <span className="bcc-mono text-[9px] text-ink-soft/70">
              {formatRelativeTime(item.pulled_at)}
            </span>
          )}
        </div>
      </div>

      {/* Unpull button — top-right overlay, only visible on hover/focus */}
      <button
        type="button"
        onClick={handleUnpull}
        disabled={isUnpulling || unpullMut.isPending}
        title="Remove from binder"
        className="bcc-mono absolute right-2 top-1.5 z-10 h-6 w-6 rounded-full border border-white/40 bg-black/50 text-[10px] text-white opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100 disabled:opacity-50"
      >
        {isUnpulling || unpullMut.isPending ? "…" : "✕"}
      </button>
    </Link>
  );
}


