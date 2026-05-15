"use client";

/**
 * NftShowcaseSettings — the /settings/nft-showcase content surface.
 *
 * Renders the user's currently saved selections + an "EDIT SHOWCASE"
 * button that opens <NftPickerModal>. The list re-fetches automatically
 * on save/delete because the modal invalidates the same query key root.
 *
 * Visual: the whole section sits inside a bcc-panel cream surface so
 * dark `text-ink` body copy stays readable on the concrete page
 * background (CommunitiesList uses the same pattern). Tiles render on
 * the brighter `bcc-paper` tone for a subtle two-tone hierarchy.
 *
 * Per-tile MOVE UP / MOVE DOWN buttons set display_order via the
 * `POST /nft-selections/reorder` endpoint with an optimistic cache
 * patch. Buttons are chosen over drag-and-drop because the codebase
 * has no DnD library and buttons are WCAG-friendly out of the box —
 * a per-tile-focused keyboard user gets the same affordance a mouse
 * user does. Reorder failure restores the previous order from the
 * snapshot; the user sees no half-state.
 *
 * Per-tile remove is still deferred to the picker modal.
 */

import { BccApiError } from "@/lib/api/types";
import Link from "next/link";
import { useState } from "react";

import { NftPickerModal } from "@/components/onchain/NftPickerModal";
import {
  useNftSelectionsList,
  useReorderNftSelections,
} from "@/hooks/useNftSelections";
import { humanizeCode } from "@/lib/api/errors";
import type { NftSelectionRow } from "@/lib/api/types";

export function NftShowcaseSettings() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const list = useNftSelectionsList();
  const reorder = useReorderNftSelections();

  const items = list.isSuccess ? list.data.items : [];

  const handleMove = (index: number, direction: "up" | "down"): void => {
    const swapWith = direction === "up" ? index - 1 : index + 1;
    if (swapWith < 0 || swapWith >= items.length) return;
    if (reorder.isPending) return;

    const newOrder = items.map((row) => Number(row.id));
    // Bounds were checked above, but noUncheckedIndexedAccess types
    // newOrder[i] as `number | undefined` — pull explicit locals.
    const a = newOrder[index];
    const b = newOrder[swapWith];
    if (a === undefined || b === undefined) return;
    newOrder[index] = b;
    newOrder[swapWith] = a;

    setReorderError(null);
    reorder.mutate(newOrder, {
      onError: (err) => {
        setReorderError(humanizeReorderError(err));
      },
    });
  };

  return (
    <>
      <div className="bcc-panel p-5 md:p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-dashed border-ink/15 pb-3">
          <p className="bcc-mono text-ink-soft">
            {list.isSuccess
              ? `ON FLOOR // ${list.data.items.length} ${list.data.items.length === 1 ? "ITEM" : "ITEMS"}`
              : "ON FLOOR //"}
          </p>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="bcc-stencil bg-ink px-4 py-2 text-[11px] tracking-[0.2em] text-cardstock transition hover:bg-blueprint motion-reduce:transition-none"
          >
            EDIT SHOWCASE
          </button>
        </div>

        <div className="mt-5">
          {list.isPending && (
            <p className="bcc-mono text-ink-soft">Loading showcase…</p>
          )}

          {list.isError && (
            <p role="alert" className="bcc-mono text-safety">
              Couldn&rsquo;t load your showcase: {list.error.message}
            </p>
          )}

          {list.isSuccess && items.length === 0 && <ShowcaseEmpty />}

          {list.isSuccess && items.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map((item, index) => (
                <li key={String(item.id)}>
                  <ShowcaseTile
                    item={item}
                    canMoveUp={index > 0 && !reorder.isPending}
                    canMoveDown={index < items.length - 1 && !reorder.isPending}
                    onMoveUp={() => handleMove(index, "up")}
                    onMoveDown={() => handleMove(index, "down")}
                  />
                </li>
              ))}
            </ul>
          )}

          {reorderError !== null && (
            <p
              role="alert"
              className="bcc-mono mt-4 border-l-2 border-safety pl-3 text-safety"
            >
              {reorderError}
            </p>
          )}
        </div>
      </div>

      {pickerOpen && <NftPickerModal onClose={() => setPickerOpen(false)} />}
    </>
  );
}

function humanizeReorderError(err: unknown): string {
  // Phase γ doctrine: branch on `err.code`, not `err.message`. The
  // reorder endpoint has no per-row throttle, so 429 is rare; the
  // most likely failure is a session timeout while the modal sits
  // open.
  if (err instanceof BccApiError && err.code === "bcc_rate_limited") {
    return "Cooling off — give it a beat and try again.";
  }
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in to reorder your showcase.",
    },
    "Couldn't save the new order. The tiles are back where they were.",
  );
}

// ─────────────────────────────────────────────────────────────────────
// ShowcaseTile — read-only display of a single saved selection. The
// picker modal is the single source for add/remove; this surface is a
// preview of what's currently on the floor.
// ─────────────────────────────────────────────────────────────────────

function ShowcaseTile({
  item,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
}: {
  item: NftSelectionRow;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const displayName = (item.name ?? "").trim();
  const collection = (item.collection_name ?? "").trim();
  const fallbackTitle =
    displayName !== ""
      ? displayName
      : collection !== ""
        ? collection
        : `Token #${item.token_id}`;

  return (
    <article
      className="group relative block w-full overflow-hidden border-2 border-ink/15 focus-within:border-ink/40"
      style={{ background: "var(--paper)" }}
    >
      <div className="relative aspect-square w-full bg-cardstock-deep/30">
        {item.image_url !== null && item.image_url !== "" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span
              className="bcc-stencil text-3xl"
              style={{ color: "var(--cardstock-deep)" }}
            >
              №{item.token_id.length > 4 ? item.token_id.slice(0, 4) : item.token_id}
            </span>
          </div>
        )}

        {/*
          MOVE UP / MOVE DOWN affordance. Visible on hover OR keyboard
          focus-within so a keyboard user can reorder without ever
          touching a pointer. Disabled at list endpoints so the user
          gets immediate first-tile / last-tile feedback.
        */}
        <div className="absolute left-2 top-2 flex flex-col gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label={`Move ${fallbackTitle} up`}
            className="bcc-mono border border-ink/30 bg-cardstock/95 px-2 py-0.5 text-[10px] tracking-[0.18em] text-ink transition hover:bg-cardstock disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
          >
            ↑ UP
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label={`Move ${fallbackTitle} down`}
            className="bcc-mono border border-ink/30 bg-cardstock/95 px-2 py-0.5 text-[10px] tracking-[0.18em] text-ink transition hover:bg-cardstock disabled:cursor-not-allowed disabled:opacity-30 motion-reduce:transition-none"
          >
            ↓ DOWN
          </button>
        </div>
      </div>

      <div className="border-t border-ink/10 px-3 py-2">
        <p
          className="bcc-stencil text-ink"
          style={{
            fontSize: "13px",
            lineHeight: 1.1,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {fallbackTitle}
        </p>
        <p
          className="bcc-mono mt-1 text-ink-ghost"
          style={{ fontSize: "9px", letterSpacing: "0.18em" }}
        >
          {collection !== "" && collection !== fallbackTitle
            ? `${collection.toUpperCase()} · `
            : ""}
          {item.chain_name.toUpperCase()}
        </p>
        {item.explorer_url !== null && item.explorer_url !== "" && (
          <a
            href={item.explorer_url}
            target="_blank"
            rel="noreferrer noopener"
            className="bcc-mono mt-1 inline-block text-blueprint underline-offset-2 hover:underline"
            style={{ fontSize: "9px", letterSpacing: "0.18em" }}
          >
            VIEW ON CHAIN ↗
          </a>
        )}
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ShowcaseEmpty — first-time empty state. Frames the showcase as
// optional, not as missing functionality. Also surfaces the
// wallet-link CTA — most users land here because they haven't linked
// a wallet yet, not because they have no NFTs in linked wallets.
// ─────────────────────────────────────────────────────────────────────

function ShowcaseEmpty() {
  return (
    <div className="border-2 border-dashed border-ink/30 bg-paper p-6 text-center">
      <p className="bcc-mono text-safety">EMPTY FLOOR</p>
      <p className="bcc-stencil mt-2 text-2xl text-ink">
        Nothing on display yet.
      </p>
      <p
        className="mx-auto mt-3 max-w-md font-serif italic text-ink-soft"
        style={{ fontSize: "14px", lineHeight: 1.55 }}
      >
        Hit <span className="bcc-mono text-ink">EDIT SHOWCASE</span> to
        pick NFTs from any wallet you&rsquo;ve linked. No wallets yet?
        Link one first and your holdings will show up in the picker.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/settings/account"
          className="bcc-stencil border-2 border-ink px-4 py-2 text-[11px] tracking-[0.2em] text-ink transition hover:bg-ink hover:text-cardstock motion-reduce:transition-none"
        >
          LINK A WALLET →
        </Link>
      </div>
    </div>
  );
}
