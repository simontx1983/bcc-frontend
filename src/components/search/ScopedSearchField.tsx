"use client";

/**
 * The search field that opens a section page's filter row (Structure A §9).
 * Scoped to that page and tab; the header search stays the global one.
 *
 * Presentation only: the page owns the value, the URL (`?q=`) and any
 * debounce, and the SERVER does the searching (never a filter over one
 * loaded page). What this fixes on every page at once:
 *   - 44px tall and 16px text, so iOS doesn't zoom into it;
 *   - a clear (×) button, a 44px target, shown only while there is text;
 *   - the server's query cap as `maxLength`;
 *   - a placeholder that names the scope ("Search validators…").
 *
 * `tone` keeps today's cardstock directory panels looking as they do;
 * "app" is the default surface.
 */

import { useId } from "react";

export interface ScopedSearchFieldProps {
  /** Visible label above the field. */
  label: string;
  /** Names the scope: "Search validators…", "Search members…". */
  placeholder: string;
  value: string;
  onChange: (next: string) => void;
  /** Empties the field (and the page's `?q=`). */
  onClear: () => void;
  /** The server's cap: 100 for /cards, 64 for /members. */
  maxLength: number;
  tone?: "app" | "cardstock";
}

const TONE = {
  app: {
    label: "text-bcc-text-secondary",
    input:
      "border border-bcc-input-border bg-bcc-input-bg text-bcc-text placeholder:text-bcc-text-placeholder focus:border-bcc-accent focus:ring-1 focus:ring-bcc-accent",
    clear: "text-bcc-text-secondary hover:text-bcc-text",
  },
  cardstock: {
    label: "text-cardstock-deep",
    input:
      "bg-cardstock text-ink placeholder:text-ink-soft/60 ring-1 ring-cardstock-edge focus:ring-2 focus:ring-blueprint",
    clear: "text-ink-soft hover:text-ink",
  },
} as const;

export function ScopedSearchField({
  label,
  placeholder,
  value,
  onChange,
  onClear,
  maxLength,
  tone = "app",
}: ScopedSearchFieldProps) {
  const id = useId();
  const styles = TONE[tone];
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className={`bcc-mono text-[10px] tracking-[0.2em] ${styles.label}`}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type="search"
          inputMode="search"
          enterKeyHint="search"
          autoComplete="off"
          spellCheck={false}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={`bcc-mono min-h-[44px] w-full rounded-sm py-2 pl-3 pr-11 text-base outline-none [&::-webkit-search-cancel-button]:appearance-none ${styles.input}`}
        />
        {value !== "" && (
          <button
            type="button"
            onClick={onClear}
            aria-label="Clear search"
            className={`absolute right-0 top-0 inline-flex h-[44px] w-[44px] items-center justify-center text-lg ${styles.clear}`}
          >
            <span aria-hidden>×</span>
          </button>
        )}
      </div>
    </div>
  );
}
