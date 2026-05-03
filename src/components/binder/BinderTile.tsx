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
    unpullMut.mutate(item.follow_id);
  };

  const initials = deriveInitials(item.card_handle);
  const kindColor = KIND_COLORS[item.card_kind];
  const cardHref = item.links.card as Route;

  return (
    <Link
      href={cardHref}
      className="group bcc-panel relative flex h-[260px] w-[180px] flex-col overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-blueprint"
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
            title="Imported follow — no original pull moment"
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

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

/**
 * Derive 2-character initials from a handle. Strips hyphens, takes
 * the first character of each word (or first two chars if single word).
 * Always uppercase, always exactly 2 chars (handles short handles by
 * padding the second char with the first).
 */
function deriveInitials(handle: string): string {
  if (handle === "") return "BC";
  const words = handle.split("-").filter((w) => w.length > 0);
  if (words.length >= 2) {
    return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? "")).toUpperCase();
  }
  const first = words[0] ?? handle;
  return (first.slice(0, 2).padEnd(2, first[0] ?? "")).toUpperCase();
}

