"use client";

/**
 * GlobalSearch — §G1 nav-bar autocomplete.
 *
 * A small search input with a dropdown of <SearchSuggestion> rows.
 * Lives in the SiteHeader's nav-actions slot. Anonymous-OK; visible
 * regardless of session state.
 *
 * UX:
 *   - Focus expands the input. Empty / sub-2-char input shows nothing.
 *   - 2+ chars → dropdown of up to 12 results, ranked by bcc-search.
 *   - Each row links to the entity profile (`/v/:slug`, `/p/:slug`,
 *     `/c/:slug`). Server pre-built the route per §A2.
 *   - Keyboard: ↓/↑ moves focus, Enter activates, Esc closes,
 *     outside-click closes (mirrors the SiteHeader's ViewerMenu).
 *   - The "View all in directory" footer link shuttles the user to
 *     `/directory?q=…` when they want more than the top 12.
 *
 * Why not server-render the dropdown:
 *   The whole component is interaction state — input value, dropdown
 *   open/closed, hover index. SSR adds nothing here; making it a
 *   client component avoids a hydration round-trip for a control
 *   that the user always touches before it does anything.
 */

import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import type { SearchSuggestion } from "@/lib/api/types";

export function GlobalSearch() {
  const router = useRouter();
  const inputId = useId();

  const [query, setQuery] = useState<string>("");
  const [open, setOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const search = useGlobalSearch(query);
  const items: SearchSuggestion[] = search.data?.items ?? [];

  // Close on outside click + Escape — same primitive as SiteHeader's
  // ViewerMenu. Single effect, scoped on `open` to avoid leaking
  // listeners when the dropdown is hidden.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (containerRef.current === null) return;
      if (!(event.target instanceof Node)) return;
      if (containerRef.current.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        inputRef.current?.blur();
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Reset the active index whenever the result list shifts so an
  // out-of-bounds index doesn't render an invisible focus state.
  useEffect(() => {
    setActiveIndex(-1);
  }, [items.length, query]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (items.length === 0) return;
      setOpen(true);
      setActiveIndex((prev) => (prev + 1) % items.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (items.length === 0) return;
      setOpen(true);
      setActiveIndex((prev) => (prev <= 0 ? items.length - 1 : prev - 1));
      return;
    }
    if (event.key === "Enter") {
      // Active suggestion → navigate. No active suggestion + non-empty
      // query → fall through to the directory with the query pre-set.
      if (activeIndex >= 0 && activeIndex < items.length) {
        event.preventDefault();
        const target = items[activeIndex];
        if (target !== undefined) {
          navigateAndClose(target.href);
        }
        return;
      }
      const trimmed = query.trim();
      if (trimmed.length >= 2) {
        event.preventDefault();
        navigateAndClose(`/directory?q=${encodeURIComponent(trimmed)}`);
      }
    }
  };

  const navigateAndClose = (href: string) => {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
    inputRef.current?.blur();
    router.push(href as Route);
  };

  // Show the dropdown when focused AND we have something to render
  // (results in flight, results back, or "no matches" message).
  const trimmed = query.trim();
  const showDropdown = open && trimmed.length >= 2;

  return (
    <div ref={containerRef} className="relative">
      <label htmlFor={inputId} className="sr-only">
        Search the floor
      </label>
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={`${inputId}-listbox`}
        aria-autocomplete="list"
        aria-activedescendant={
          activeIndex >= 0 ? `${inputId}-opt-${activeIndex}` : undefined
        }
        placeholder="Search the floor…"
        className="bcc-mono w-36 bg-cardstock px-3 py-1.5 text-[12px] text-ink placeholder:text-ink-soft/60 ring-1 ring-cardstock-edge focus:outline-none focus:ring-2 focus:ring-blueprint sm:w-48 md:w-64"
      />

      {showDropdown && (
        <div
          id={`${inputId}-listbox`}
          role="listbox"
          className="bcc-panel absolute right-0 top-full z-30 mt-1 flex w-[min(28rem,90vw)] flex-col gap-px overflow-hidden"
          style={{ background: "rgba(15,13,9,0.06)" }}
        >
          {search.isError ? (
            <div className="bcc-mono bg-cardstock px-4 py-3 text-[11px] text-ink-soft">
              Search is briefly unavailable. Try again in a moment.
            </div>
          ) : items.length === 0 ? (
            <div className="bcc-mono bg-cardstock px-4 py-3 text-[11px] text-ink-soft">
              {search.isFetching ? "Searching…" : `No matches for “${trimmed}”.`}
            </div>
          ) : (
            <ul role="presentation" className="flex flex-col gap-px">
              {items.map((item, idx) => (
                <SuggestionRow
                  key={`${item.card_kind}-${item.id}`}
                  item={item}
                  id={`${inputId}-opt-${idx}`}
                  active={idx === activeIndex}
                  onActivate={() => navigateAndClose(item.href)}
                  onHover={() => setActiveIndex(idx)}
                />
              ))}
            </ul>
          )}

          {trimmed.length >= 2 && (
            <button
              type="button"
              onClick={() =>
                navigateAndClose(`/directory?q=${encodeURIComponent(trimmed)}`)
              }
              className="bcc-mono bg-cardstock px-4 py-2.5 text-left text-[10px] tracking-[0.18em] text-blueprint hover:bg-cardstock-deep"
            >
              VIEW ALL IN DIRECTORY →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

interface SuggestionRowProps {
  item: SearchSuggestion;
  id: string;
  active: boolean;
  onActivate: () => void;
  onHover: () => void;
}

function SuggestionRow({ item, id, active, onActivate, onHover }: SuggestionRowProps) {
  return (
    <li role="option" id={id} aria-selected={active}>
      <button
        type="button"
        onClick={onActivate}
        onMouseEnter={onHover}
        className={
          "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition " +
          (active ? "bg-cardstock-deep" : "bg-cardstock hover:bg-cardstock-deep")
        }
      >
        <span className="flex flex-col gap-0.5 overflow-hidden">
          <span className="bcc-stencil truncate text-sm text-ink">{item.name}</span>
          <span className="bcc-mono truncate text-[10px] text-cardstock-deep">
            {item.card_kind.toUpperCase()} · @{item.handle}
          </span>
        </span>

        {item.tier_label !== null && item.card_tier !== null && (
          <span
            className="bcc-mono shrink-0 rounded-sm px-2 py-0.5 text-[9px] tracking-[0.18em]"
            style={{
              color: `var(--tier-${item.card_tier})`,
              background: "rgba(15,13,9,0.04)",
              border: "1px solid rgba(15,13,9,0.12)",
            }}
          >
            {item.tier_label.toUpperCase()}
          </span>
        )}
      </button>
    </li>
  );
}
