"use client";

/**
 * GlobalSearch — §G1 nav-bar autocomplete.
 *
 * A search input with a dropdown of <SearchSuggestion> rows. Mounted
 * in the SiteHeader's centered search slot (the header passes
 * `inputClassName="bcc-search-input"` so the input keeps the header's
 * visual language). Anonymous-OK; visible regardless of session state.
 *
 * UX:
 *   - Focus on an empty input → "Pre-search" surface: most recent
 *     searches (localStorage) above the current trending list.
 *   - 2+ chars → dropdown of up to 12 results, ranked by bcc-search.
 *     Each row links to the entity profile (`/v/:slug`, `/p/:slug`,
 *     `/c/:slug`). Server pre-built the route per §A2.
 *   - Keyboard: ↓/↑ moves focus, Enter activates, Esc closes,
 *     outside-click closes (mirrors the SiteHeader's ViewerMenu).
 *   - The footer link shuttles the user to `/search?q=…` (the
 *     multi-vertical results page) when they want more than the
 *     auto-complete preview.
 *
 * Single-vertical scope (deliberate):
 *   The dropdown talks only to `/bcc/v1/cards/search` (the §A2 cards
 *   wrapper). It does NOT fan out to /search/users + /search/groups on
 *   every keystroke — the multi-vertical UX lives on the /search
 *   results page so a single keystroke costs one request, not three.
 *
 * Why not server-render the dropdown:
 *   The whole component is interaction state — input value, dropdown
 *   open/closed, hover index. SSR adds nothing here; making it a
 *   client component avoids a hydration round-trip for a control
 *   that the user always touches before it does anything.
 */

import { useRouter } from "next/navigation";
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";

import { VerifiedBadge } from "@/components/ui/VerifiedBadge";
import { useGlobalSearch } from "@/hooks/useGlobalSearch";
import {
  isTypingTarget,
  useKeyboardShortcuts,
} from "@/hooks/useKeyboardShortcuts";
import { useRecentSearches } from "@/hooks/useRecentSearches";
import { useTrendingSearches } from "@/hooks/useTrendingSearches";
import type {
  ProjectSearchResult,
  SearchSuggestion,
} from "@/lib/api/types";
import { toInternalHref } from "@/lib/internal-route";

const MAX_TRENDING_IN_DROPDOWN = 5;

interface GlobalSearchProps {
  /** Extra classes appended to the positioning container (`relative`). */
  className?: string;
  /**
   * REPLACES the default compact input styling when provided — the
   * SiteHeader passes `bcc-search-input` so the combobox inherits the
   * header's glass input treatment instead of the Tailwind default.
   */
  inputClassName?: string;
  /** Input placeholder override. */
  placeholder?: string;
  /**
   * Register the page-global "/" and ⌘K/Ctrl+K focus-search shortcut
   * (via useKeyboardShortcuts). Enable on at most ONE mounted instance
   * per page so two listeners don't fight over focus.
   */
  focusShortcut?: boolean;
}

export function GlobalSearch({
  className,
  inputClassName,
  placeholder = "Search BCC…",
  focusShortcut = false,
}: GlobalSearchProps) {
  const router = useRouter();
  const inputId = useId();

  const [query, setQuery] = useState<string>("");
  const [open, setOpen] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const search = useGlobalSearch(query);
  const items: SearchSuggestion[] = search.data?.items ?? [];

  const recents = useRecentSearches();
  const trimmed = query.trim();
  const showPreSearch = open && trimmed.length < 2;
  const showResults = open && trimmed.length >= 2;
  // Only fetch trending when we'd actually display it (pre-search surface
  // is visible AND the input is focused). Avoids a network call for users
  // who never touch the search bar.
  const trending = useTrendingSearches({ enabled: showPreSearch });

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
        // preventDefault: Chrome's native <input type="search"> action
        // clears the text on Escape, which fires onChange → setOpen(true)
        // and would re-open the dropdown this handler just closed.
        event.preventDefault();
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

  // "/" (plus ⌘K/Ctrl+K, preserving the SiteHeader's historical
  // binding) focuses the input from anywhere on the page. Opt-in via
  // `focusShortcut` so a second mounted instance can't double-register.
  // "/" stays quiet while the user is typing elsewhere (composer,
  // settings forms) — the ⌘K chord fires regardless, like before.
  useKeyboardShortcuts(
    [
      {
        key: "/",
        description: "Focus search",
        when: (event) =>
          !event.metaKey &&
          !event.ctrlKey &&
          !event.altKey &&
          !isTypingTarget(event.target),
        run: (event) => {
          event.preventDefault();
          inputRef.current?.focus();
        },
      },
      {
        key: "k",
        label: "⌘K",
        description: "Focus search",
        when: (event) => event.metaKey || event.ctrlKey,
        run: (event) => {
          event.preventDefault();
          inputRef.current?.focus();
        },
      },
    ],
    focusShortcut,
  );

  const submitFreeText = (q: string) => {
    const cleaned = q.trim();
    if (cleaned.length < 2) return;
    recents.push(cleaned);
    navigateAndClose(`/search?q=${encodeURIComponent(cleaned)}`);
  };

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
      // Active suggestion → navigate to that entity AND record the
      // query in recents (the user just used it productively).
      if (activeIndex >= 0 && activeIndex < items.length) {
        event.preventDefault();
        const target = items[activeIndex];
        if (target !== undefined) {
          if (trimmed.length >= 2) recents.push(trimmed);
          navigateAndClose(target.href);
        }
        return;
      }
      // No active suggestion + non-empty query → fall through to the
      // /search page with the query pre-set.
      if (trimmed.length >= 2) {
        event.preventDefault();
        submitFreeText(trimmed);
      }
    }
  };

  const navigateAndClose = (href: string) => {
    setOpen(false);
    setQuery("");
    setActiveIndex(-1);
    inputRef.current?.blur();
    router.push(toInternalHref(href));
  };

  const showDropdown = showPreSearch || showResults;

  return (
    <div
      ref={containerRef}
      role="search"
      className={className ? `relative ${className}` : "relative"}
    >
      <label htmlFor={inputId} className="sr-only">
        Search BCC
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
        placeholder={placeholder}
        className={
          inputClassName ??
          "bcc-mono w-36 bg-cardstock px-3 py-1.5 text-[12px] text-ink placeholder:text-ink-soft/60 ring-1 ring-cardstock-edge focus:outline-none focus:ring-2 focus:ring-blueprint sm:w-48 md:w-64"
        }
      />

      {showDropdown && (
        <div
          id={`${inputId}-listbox`}
          role="listbox"
          className="bcc-panel absolute left-0 top-full z-30 mt-1 flex w-full min-w-[min(28rem,90vw)] flex-col gap-px overflow-hidden"
          style={{ background: "rgb(var(--ink-rgb) / 0.06)" }}
        >
          {showPreSearch ? (
            <PreSearchSurface
              recents={recents.recent}
              onSelectRecent={(q) => {
                setQuery(q);
                inputRef.current?.focus();
              }}
              onRemoveRecent={recents.remove}
              onClearRecents={recents.clear}
              trending={trending.data?.results ?? []}
              trendingLoading={trending.isLoading}
              onSelectTrending={(q) => {
                recents.push(q);
                navigateAndClose(`/search?q=${encodeURIComponent(q)}`);
              }}
            />
          ) : search.isError ? (
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
                  onActivate={() => {
                    if (trimmed.length >= 2) recents.push(trimmed);
                    navigateAndClose(item.href);
                  }}
                  onHover={() => setActiveIndex(idx)}
                />
              ))}
            </ul>
          )}

          {trimmed.length >= 2 && (
            <button
              type="button"
              onClick={() => submitFreeText(trimmed)}
              className="bcc-mono bg-cardstock px-4 py-2.5 text-left text-[10px] tracking-[0.18em] text-blueprint hover:bg-cardstock-deep motion-safe:transition-colors motion-safe:duration-bcc-fast"
            >
              VIEW ALL RESULTS →
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PreSearchSurface — empty-input dropdown content.
// Two sections: RECENT (localStorage, hidden if none) and TRENDING
// (top 5 projects from /bcc/v1/search?trending=1).
// ─────────────────────────────────────────────────────────────────────

interface PreSearchSurfaceProps {
  recents: string[];
  onSelectRecent: (q: string) => void;
  onRemoveRecent: (q: string) => void;
  onClearRecents: () => void;
  trending: ProjectSearchResult[];
  trendingLoading: boolean;
  onSelectTrending: (q: string) => void;
}

function PreSearchSurface({
  recents,
  onSelectRecent,
  onRemoveRecent,
  onClearRecents,
  trending,
  trendingLoading,
  onSelectTrending,
}: PreSearchSurfaceProps) {
  const trendingItems = trending.slice(0, MAX_TRENDING_IN_DROPDOWN);
  return (
    <>
      {recents.length > 0 && (
        <div className="bg-cardstock">
          <SectionHeader
            label="RECENT"
            action={
              <button
                type="button"
                onClick={onClearRecents}
                className="bcc-mono text-[9px] tracking-[0.18em] text-blueprint hover:underline"
              >
                CLEAR
              </button>
            }
          />
          <ul role="presentation" className="flex flex-col gap-px">
            {recents.map((q) => (
              <li key={q} className="flex items-center bg-cardstock">
                <button
                  type="button"
                  onClick={() => onSelectRecent(q)}
                  className="bcc-stencil flex-1 truncate px-4 py-2 text-left text-sm text-ink hover:bg-cardstock-deep motion-safe:transition-colors motion-safe:duration-bcc-fast"
                >
                  {q}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveRecent(q)}
                  aria-label={`Remove ${q} from recent searches`}
                  className="bcc-mono px-3 py-2 text-[10px] text-ink-soft hover:text-safety motion-safe:transition-colors motion-safe:duration-bcc-fast"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-cardstock">
        <SectionHeader label="TRENDING" />
        {trendingLoading ? (
          <div className="bcc-mono px-4 py-2.5 text-[11px] text-ink-soft">
            Loading trending…
          </div>
        ) : trendingItems.length === 0 ? (
          <div className="bcc-mono px-4 py-2.5 text-[11px] text-ink-soft">
            Nothing trending right now.
          </div>
        ) : (
          <ul role="presentation" className="flex flex-col gap-px">
            {trendingItems.map((row) => (
              <li key={`trend-${row.page_id}`} className="bg-cardstock">
                <button
                  type="button"
                  onClick={() => onSelectTrending(row.page_name)}
                  className="bcc-stencil w-full truncate px-4 py-2 text-left text-sm text-ink hover:bg-cardstock-deep motion-safe:transition-colors motion-safe:duration-bcc-fast"
                >
                  {row.page_name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function SectionHeader({
  label,
  action,
}: {
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between border-b border-cardstock-edge/30 bg-cardstock px-4 py-1.5">
      <span className="bcc-mono text-[9px] tracking-[0.18em] text-ink-soft">
        {label}
      </span>
      {action}
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
          "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left motion-safe:transition motion-safe:duration-bcc-fast " +
          (active ? "bg-cardstock-deep" : "bg-cardstock hover:bg-cardstock-deep")
        }
      >
        <span className="flex flex-col gap-0.5 overflow-hidden">
          <span className="bcc-stencil truncate text-sm text-ink">{item.name}</span>
          <span className="bcc-mono truncate text-[10px] text-cardstock-deep">
            {item.card_kind.toUpperCase()} · @{item.handle}
          </span>
        </span>

        {/* Right-hand cluster: claim-verified checkmark (§ verified-wins,
            server-resolved boolean) beside the tier chip. Either may
            render without the other. */}
        <span className="flex shrink-0 items-center gap-1.5">
          {item.is_claim_verified && <VerifiedBadge />}
          {item.tier_label !== null && item.card_tier !== null && (
            <span
              className="bcc-mono shrink-0 rounded-sm px-2 py-0.5 text-[9px] tracking-[0.18em]"
              style={{
                color: `var(--tier-${item.card_tier})`,
                background: "rgb(var(--ink-rgb) / 0.04)",
                border: "1px solid rgb(var(--ink-rgb) / 0.12)",
              }}
            >
              {item.tier_label.toUpperCase()}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
