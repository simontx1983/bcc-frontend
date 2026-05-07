"use client";

/**
 * GifPicker — inline expansion below the composer textarea for
 * picking a Giphy GIF. Per Phillip's UX call (Phase 1c), the picker
 * is "temporary expressive enhancement," NOT a media-browser. So:
 *
 *   - constrained max-height with internal scroll (~280px)
 *   - lightweight visual weight — no card chrome, sits in the dark
 *     composer surface
 *   - search input at top, trending-by-default below
 *   - "Powered by Giphy" attribution footer (Giphy TOS requirement)
 *   - selection instantly fires onSelect + the consumer should
 *     close the picker and return focus to the textarea
 *
 * The picker fetches via the configured Giphy API key (resolved via
 * useGiphyIntegration), debounces typing, and shows trending when
 * the query is empty. Loading + error states render inline so the
 * picker never blocks the rest of the composer.
 *
 * Per §A2 the picker reads the integration config from the server;
 * it never embeds an API key in the bundle.
 */

import { useState } from "react";

import { useGiphySearch } from "@/hooks/useGiphySearch";
import type { GiphyIntegrationConfig, GiphySearchResult } from "@/lib/api/types";

export interface GifPickerProps {
  config: GiphyIntegrationConfig;
  onSelect: (gif: GiphySearchResult) => void;
  onClose: () => void;
}

export function GifPicker({ config, onSelect, onClose }: GifPickerProps) {
  const [query, setQuery] = useState("");
  const search = useGiphySearch({ query, config, enabled: true });

  const items = search.data ?? [];
  const isEmpty = !search.isLoading && !search.isError && items.length === 0;

  return (
    <div
      role="region"
      aria-label="GIF picker"
      className="flex flex-col gap-2 rounded-sm border border-cardstock-edge/30 bg-cardstock/5 px-3 py-3"
    >
      <header className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search GIFs…"
          aria-label="Search GIFs"
          className="bcc-mono flex-1 rounded-sm border border-cardstock-edge/40 bg-transparent px-3 py-1.5 text-[12px] text-cardstock placeholder:text-cardstock-deep/50 focus:border-blueprint focus:outline-none"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close GIF picker"
          className="bcc-mono shrink-0 px-2 text-[10px] tracking-[0.24em] text-cardstock-deep/70 hover:text-cardstock"
        >
          CLOSE
        </button>
      </header>

      {/* Constrained height + internal scroll keeps the picker from
          dominating the composer. ~280px gives room for ~3 rows of
          GIFs at typical preview aspect ratio without taking over
          the page. */}
      <div className="max-h-[280px] overflow-y-auto">
        {search.isLoading && (
          <p className="bcc-mono py-6 text-center text-[11px] text-cardstock-deep/70">
            Loading GIFs…
          </p>
        )}
        {search.isError && (
          <p className="bcc-mono py-6 text-center text-[11px] text-safety">
            Couldn&apos;t load GIFs. Try again.
          </p>
        )}
        {isEmpty && (
          <p className="bcc-mono py-6 text-center text-[11px] text-cardstock-deep/70">
            No GIFs match &ldquo;{query}&rdquo;.
          </p>
        )}
        {items.length > 0 && (
          <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
            {items.map((gif) => (
              <li key={gif.id}>
                <button
                  type="button"
                  onClick={() => onSelect(gif)}
                  className="block w-full overflow-hidden rounded-sm border border-cardstock-edge/30 bg-ink/40 transition hover:border-blueprint focus:border-blueprint focus:outline-none"
                  aria-label={gif.title !== "" ? gif.title : "Select GIF"}
                  title={gif.title}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={gif.preview_url}
                    alt=""
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Giphy attribution lives only inside the picker. The
          rendered card stays clean (no per-post attribution clutter
          per Phase 1c product call). */}
      <footer className="flex items-center justify-end">
        <span className="bcc-mono text-[9px] tracking-[0.18em] text-cardstock-deep/60">
          POWERED BY GIPHY
        </span>
      </footer>
    </div>
  );
}
