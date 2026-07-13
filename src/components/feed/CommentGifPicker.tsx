"use client";

/**
 * CommentGifPicker — themed GIF picker for the comment composer.
 *
 * Functionally identical to the post composer's `GifPicker` (search +
 * trending-by-default, debounced, Giphy attribution), but painted in the
 * `--bcc-*` day/night chrome tokens instead of the cardstock/ink palette:
 * the comment drawer is page chrome (§ design system) and must flip with
 * light/dark, whereas the post composer sits on a fixed dark cardstock
 * surface. Reuses the same `useGiphySearch` hook + `GiphySearchResult`
 * shape, so it's presentation-only — no new data path.
 *
 * Per §A2 the picker reads its config from the server (via the caller's
 * `useGiphyIntegration`); it never embeds an API key in the bundle.
 */

import { useState } from "react";

import { useGiphySearch } from "@/hooks/useGiphySearch";
import type { GiphyIntegrationConfig, GiphySearchResult } from "@/lib/api/types";

export interface CommentGifPickerProps {
  config: GiphyIntegrationConfig;
  onSelect: (gif: GiphySearchResult) => void;
  onClose: () => void;
}

export function CommentGifPicker({ config, onSelect, onClose }: CommentGifPickerProps) {
  const [query, setQuery] = useState("");
  const search = useGiphySearch({ query, config, enabled: true });

  const items = search.data ?? [];
  const isEmpty = !search.isLoading && !search.isError && items.length === 0;

  return (
    <div
      role="region"
      aria-label="GIF picker"
      className="mt-2 flex flex-col gap-2 rounded-xl border border-[var(--bcc-border)] bg-[var(--bcc-surface)] px-3 py-3"
    >
      <header className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs…"
          aria-label="Search GIFs"
          className="bcc-mono flex-1 rounded-lg border border-[var(--bcc-border)] bg-transparent px-3 py-1.5 text-[12px] text-[var(--bcc-text)] placeholder:text-[var(--bcc-text-muted)] focus:border-[var(--bcc-accent)] focus:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close GIF picker"
          className="bcc-mono shrink-0 px-2 text-[10px] tracking-[0.24em] text-[var(--bcc-text-muted)] hover:text-[var(--bcc-text)]"
        >
          CLOSE
        </button>
      </header>

      {/* Constrained height + internal scroll keeps the picker from
          dominating the drawer. ~240px gives ~3 rows at typical preview
          aspect ratio. */}
      <div className="max-h-[50vh] overflow-y-auto sm:max-h-[240px]">
        {search.isLoading && (
          <p className="bcc-mono py-6 text-center text-[11px] text-[var(--bcc-text-muted)]">
            Loading GIFs…
          </p>
        )}
        {search.isError && (
          <p className="bcc-mono py-6 text-center text-[11px] text-[var(--bcc-danger)]">
            Couldn&apos;t load GIFs. Try again.
          </p>
        )}
        {isEmpty && (
          <p className="bcc-mono py-6 text-center text-[11px] text-[var(--bcc-text-muted)]">
            No GIFs match &ldquo;{query}&rdquo;.
          </p>
        )}
        {items.length > 0 && (
          <ul className="grid grid-cols-3 gap-1">
            {items.map((gif) => (
              <li key={gif.id}>
                <button
                  type="button"
                  onClick={() => onSelect(gif)}
                  className="block w-full overflow-hidden rounded-lg border border-[var(--bcc-border)] transition hover:border-[var(--bcc-accent)] focus:border-[var(--bcc-accent)] focus:outline-none"
                  aria-label={gif.title !== "" ? gif.title : "Select GIF"}
                  title={gif.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- remote Giphy preview, no per-tenant remotePatterns allow-list */}
                  <img
                    src={gif.preview_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Giphy attribution (Giphy TOS) — lives inside the picker only. */}
      <footer className="flex items-center justify-end">
        <span className="bcc-mono text-[9px] tracking-[0.18em] text-[var(--bcc-text-muted)]">
          POWERED BY GIPHY
        </span>
      </footer>
    </div>
  );
}
