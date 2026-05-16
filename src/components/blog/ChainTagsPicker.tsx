"use client";

/**
 * ChainTagsPicker — multi-select chain-tag picker.
 *
 * 0..BLOG_CHAIN_TAGS_MAX (3) chains can be tagged on a post. Chain
 * options come from `GET /bcc/v1/blog/chain-options` via
 * `useBlogChainOptions` (1-hour stale). The picker renders an
 * autocomplete dropdown filtered by name + slug; clicked chains
 * become pills with the curated `color` (Bitcoin = #F7931A,
 * others = neutral until admins set custom colors).
 *
 * Submits chain SLUGS over the wire — the server resolves to chain
 * ids via ChainRepository::getBySlug. Slug stability is part of the
 * §9 contract; renames flow through the chain registry, not the
 * post.
 */

import { useMemo, useState } from "react";

import { BLOG_CHAIN_TAGS_MAX } from "@/lib/api/types";
import { useBlogChainOptions } from "@/hooks/useBlogChainOptions";

export interface ChainTagsPickerProps {
  /** Chain slugs the writer has picked, in display order. */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function ChainTagsPicker({ value, onChange, disabled = false }: ChainTagsPickerProps) {
  const query = useBlogChainOptions();
  const [filter, setFilter] = useState("");
  const atCap = value.length >= BLOG_CHAIN_TAGS_MAX;

  const items = query.data?.items ?? [];
  const bySlug = useMemo(() => {
    const map = new Map<string, typeof items[number]>();
    for (const it of items) map.set(it.slug, it);
    return map;
  }, [items]);

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (needle === "") return items.filter((it) => !value.includes(it.slug)).slice(0, 8);
    return items
      .filter(
        (it) =>
          !value.includes(it.slug) &&
          (it.slug.includes(needle) || it.name.toLowerCase().includes(needle))
      )
      .slice(0, 8);
  }, [items, filter, value]);

  const pick = (slug: string) => {
    if (value.includes(slug) || value.length >= BLOG_CHAIN_TAGS_MAX) return;
    onChange([...value, slug]);
    setFilter("");
  };

  const remove = (slug: string) => {
    onChange(value.filter((s) => s !== slug));
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
        CHAINS · {value.length}/{BLOG_CHAIN_TAGS_MAX}
      </span>

      {/* Picked chips */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((slug) => {
            const meta = bySlug.get(slug);
            const display = meta?.name ?? slug;
            const color = meta?.color ?? null;
            const style =
              color !== null
                ? { borderColor: color, color: color }
                : undefined;
            return (
              <span
                key={slug}
                className="bcc-mono inline-flex items-center gap-2 border bg-cardstock-deep/10 px-2 py-1 text-[11px] tracking-[0.12em]"
                style={style}
              >
                {display.toUpperCase()}
                <button
                  type="button"
                  aria-label={`Remove ${display}`}
                  onClick={() => remove(slug)}
                  disabled={disabled}
                  className="text-ink-soft hover:text-safety"
                >
                  ✕
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* Filter input + suggestions */}
      {!atCap && (
        <div className="rounded-sm border border-cardstock-edge/30 bg-cardstock/40">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={
              query.isPending
                ? "Loading chain list…"
                : query.isError
                  ? "Couldn't load chains — try again later"
                  : "Search a chain (Bitcoin, Akash, …)"
            }
            disabled={disabled || query.isPending || query.isError}
            className="bcc-mono w-full bg-transparent px-3 py-2 text-[12px] text-ink placeholder:text-ink-soft/60 focus:outline-none disabled:opacity-50"
          />
          {filtered.length > 0 && (
            <ul className="max-h-48 overflow-y-auto border-t border-cardstock-edge/20">
              {filtered.map((opt) => (
                <li key={opt.slug}>
                  <button
                    type="button"
                    onClick={() => pick(opt.slug)}
                    disabled={disabled}
                    className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-cardstock-deep/15 disabled:opacity-50"
                  >
                    <span className="bcc-mono text-[12px] text-ink">
                      {opt.name}
                    </span>
                    <span
                      className="bcc-mono text-[10px] tracking-[0.18em]"
                      style={opt.color !== null ? { color: opt.color } : undefined}
                    >
                      {opt.slug.toUpperCase()}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
