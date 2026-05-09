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
 * v1 scope: list + open-picker. Drag-to-reorder and per-tile remove
 * controls are deferred — removal happens via the picker modal too.
 */

import Link from "next/link";
import { useState } from "react";

import { NftPickerModal } from "@/components/onchain/NftPickerModal";
import { useNftSelectionsList } from "@/hooks/useNftSelections";
import type { NftSelectionRow } from "@/lib/api/types";

export function NftShowcaseSettings() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const list = useNftSelectionsList();

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
            <p className="bcc-mono text-ink-soft">Pulling showcase…</p>
          )}

          {list.isError && (
            <p role="alert" className="bcc-mono text-safety">
              Couldn&rsquo;t load your showcase: {list.error.message}
            </p>
          )}

          {list.isSuccess && list.data.items.length === 0 && <ShowcaseEmpty />}

          {list.isSuccess && list.data.items.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {list.data.items.map((item) => (
                <li key={String(item.id)}>
                  <ShowcaseTile item={item} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {pickerOpen && <NftPickerModal onClose={() => setPickerOpen(false)} />}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ShowcaseTile — read-only display of a single saved selection. The
// picker modal is the single source for add/remove; this surface is a
// preview of what's currently on the floor.
// ─────────────────────────────────────────────────────────────────────

function ShowcaseTile({ item }: { item: NftSelectionRow }) {
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
      className="block w-full overflow-hidden border-2 border-ink/15"
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
