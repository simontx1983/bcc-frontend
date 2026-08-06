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
 *     Each row links to its entity (`/v/:slug`, `/p/:slug`, `/c/:slug`,
 *     and since v1.70 `/halls/:slug` / `/communities/:slug` /
 *     `/u/:handle`). Server pre-built + validated the route per §A2.
 *   - Scope <select> (v1.70): All · Validators · Projects · Creators ·
 *     Members · Communities — maps to the endpoint's `kind` param. A
 *     scoped keystroke queries exactly one vertical server-side.
 *   - Keyboard: ↓/↑ moves focus, Enter activates, Esc closes,
 *     outside-click closes (mirrors the SiteHeader avatar menu).
 *   - The footer link shuttles the user to `/search?q=…` (the
 *     multi-vertical results page) when they want more than the
 *     auto-complete preview.
 *
 * Single-REQUEST scope (deliberate):
 *   The dropdown talks only to `/bcc/v1/cards/search` (the §A2 cards
 *   wrapper). It does NOT fan out to /search/users + /search/groups on
 *   every keystroke — since v1.70 the SERVER merges those verticals
 *   into the All-scope response (≤3 communities + ≤3 members appended
 *   after pages), so one keystroke still costs one request.
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
  SuggestionKind,
} from "@/lib/api/types";
import { toInternalHref } from "@/lib/internal-route";

const MAX_TRENDING_IN_DROPDOWN = 5;

/**
 * Scope options for the dropdown's <select>. `undefined` = All (no
 * `kind` param — the server merges pages + communities + members).
 */
const SCOPE_OPTIONS: ReadonlyArray<{
  value: SuggestionKind | "all";
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "validator", label: "Validators" },
  { value: "project", label: "Projects" },
  { value: "creator", label: "Creators" },
  { value: "member", label: "Members" },
  { value: "community", label: "Communities" },
];

/**
 * Type-qualified row identity — `${card_kind}:${id}`. Numeric ids are
 * only unique WITHIN a kind (member 123, community 17 and page 17 can
 * coexist in one merged list), so anything that needs row identity —
 * the React key, the highlight-reset signature — must use this, never
 * the bare id. The colon separator is the documented contract choice
 * for this surface (deliberate divergence from the `${kind}-${id}`
 * dash idiom single-kind grids use).
 */
const suggestionKey = (suggestion: SearchSuggestion): string =>
  `${suggestion.card_kind}:${suggestion.id}`;

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
  const [scope, setScope] = useState<SuggestionKind | undefined>(undefined);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const search = useGlobalSearch(query, scope);
  const items: SearchSuggestion[] = search.data?.items ?? [];

  const recents = useRecentSearches();
  const trimmed = query.trim();
  const showPreSearch = open && trimmed.length < 2;
  const showResults = open && trimmed.length >= 2;
  // Only fetch trending when we'd actually display it (pre-search surface
  // is visible AND the input is focused). Avoids a network call for users
  // who never touch the search bar.
  const trending = useTrendingSearches({ enabled: showPreSearch });

  // Close on outside click + Escape — same primitive as the SiteHeader
  // avatar menu. Single effect, scoped on `open` to avoid leaking
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

  // Reset the active index whenever the result list's IDENTITY shifts —
  // not just its length. Under keepPreviousData a background refetch
  // can return a same-length list for the same query (15s re-rank,
  // window refocus); a length-keyed reset left the highlight silently
  // pointing at a different row — since v1.70 possibly a different
  // KIND — and Enter navigated there. The signature is order-sensitive
  // and type-qualified, so any content change resets the highlight.
  const itemsSignature = items.map(suggestionKey).join("|");
  useEffect(() => {
    setActiveIndex(-1);
  }, [itemsSignature, query]);

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
      className={
        className
          ? `relative flex items-center gap-1 ${className}`
          : "relative flex items-center gap-1"
      }
    >
      <label htmlFor={inputId} className="sr-only">
        Search BCC
      </label>
      {/* Scope select (v1.70) — native <select> for free keyboard/AT
          semantics. Sits inside the search landmark, left of the input.
          Changing scope refires the query (scope is in the hook's query
          key) and the identity-signature effect resets the highlight. */}
      <select
        aria-label="Search scope"
        value={scope ?? "all"}
        onChange={(e) => {
          const v = e.target.value;
          setScope(v === "all" ? undefined : (v as SuggestionKind));
          setOpen(true);
        }}
        className="bcc-mono shrink-0 rounded-sm border border-bcc-border bg-bcc-surface-raised px-1 py-1 text-[10px] text-bcc-text-secondary focus:outline-none focus:ring-1 focus:ring-blueprint"
      >
        {SCOPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
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
          "bcc-mono w-36 bg-bcc-surface-raised px-3 py-1.5 text-[12px] text-bcc-text placeholder:text-bcc-text-placeholder ring-1 ring-bcc-input-border focus:outline-none focus:ring-2 focus:ring-blueprint sm:w-48 md:w-64"
        }
      />

      {showDropdown && (
        <div
          id={`${inputId}-listbox`}
          role="listbox"
          // Centered on the input (left-1/2 + -translate-x-1/2) rather than
          // left-anchored — min-w-[28rem] can be wider than a narrow host
          // container, and anchoring left let it overflow off to the
          // right instead of growing symmetrically. Glassy frame (padding
          // + blur) around the rows rather than making every row's own
          // background translucent — a smaller, lower-risk change that
          // still reads as frosted at the edges/gaps.
          className="bcc-panel absolute left-1/2 top-full z-30 mt-1 flex w-full min-w-[min(28rem,90vw)] -translate-x-1/2 flex-col gap-px overflow-hidden p-1"
          style={{
            background: "var(--bcc-glass-bg-solid)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            border: "1px solid var(--bcc-glass-border)",
          }}
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
            <div className="bcc-mono bg-bcc-surface-raised px-4 py-3 text-[11px] text-bcc-text-secondary">
              Search is briefly unavailable. Try again in a moment.
            </div>
          ) : items.length === 0 ? (
            <div className="bcc-mono bg-bcc-surface-raised px-4 py-3 text-[11px] text-bcc-text-secondary">
              {search.isFetching ? "Searching…" : `No matches for “${trimmed}”.`}
            </div>
          ) : (
            <ul role="presentation" className="flex flex-col gap-px">
              {items.map((item, idx) => (
                <SuggestionRow
                  key={suggestionKey(item)}
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
              className="bcc-mono bg-bcc-surface-raised px-4 py-2.5 text-left text-[10px] tracking-[0.18em] text-blueprint hover:bg-bcc-surface-hover motion-safe:transition-colors motion-safe:duration-bcc-fast"
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
        <div className="bg-bcc-surface-raised">
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
              <li key={q} className="flex items-center bg-bcc-surface-raised">
                <button
                  type="button"
                  onClick={() => onSelectRecent(q)}
                  className="bcc-stencil flex-1 truncate px-4 py-2 text-left text-sm text-bcc-text hover:bg-bcc-surface-hover motion-safe:transition-colors motion-safe:duration-bcc-fast"
                >
                  {q}
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveRecent(q)}
                  aria-label={`Remove ${q} from recent searches`}
                  className="bcc-mono px-3 py-2 text-[10px] text-bcc-text-secondary hover:text-safety motion-safe:transition-colors motion-safe:duration-bcc-fast"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-bcc-surface-raised">
        <SectionHeader label="TRENDING" />
        {trendingLoading ? (
          <div className="bcc-mono px-4 py-2.5 text-[11px] text-bcc-text-secondary">
            Loading trending…
          </div>
        ) : trendingItems.length === 0 ? (
          <div className="bcc-mono px-4 py-2.5 text-[11px] text-bcc-text-secondary">
            Nothing trending right now.
          </div>
        ) : (
          <ul role="presentation" className="flex flex-col gap-px">
            {trendingItems.map((row) => (
              <li key={`trend-${row.page_id}`} className="bg-bcc-surface-raised">
                <button
                  type="button"
                  onClick={() => onSelectTrending(row.page_name)}
                  className="bcc-stencil w-full truncate px-4 py-2 text-left text-sm text-bcc-text hover:bg-bcc-surface-hover motion-safe:transition-colors motion-safe:duration-bcc-fast"
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
    <div className="flex items-center justify-between border-b border-bcc-border bg-bcc-surface-raised px-4 py-1.5">
      <span className="bcc-mono text-[9px] tracking-[0.18em] text-bcc-text-secondary">
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
          (active ? "bg-bcc-surface-active" : "bg-bcc-surface-raised hover:bg-bcc-surface-hover")
        }
      >
        <span className="flex flex-col gap-0.5 overflow-hidden">
          <span className="bcc-stencil truncate text-sm text-bcc-text">{item.name}</span>
          <span className="bcc-mono truncate text-[10px] text-bcc-text-secondary">
            {/* Communities use the /slug idiom (a group has no
                @-handle); members + pages keep @handle. */}
            {item.card_kind.toUpperCase()} ·{" "}
            {item.card_kind === "community" ? `/${item.handle}` : `@${item.handle}`}
          </span>
        </span>

        {/* Right-hand cluster: claim-verified checkmark (§ verified-wins,
            server-resolved boolean) beside the tier chip. Either may
            render without the other. */}
        <span className="flex shrink-0 items-center gap-1.5">
          {item.is_claim_verified && <VerifiedBadge />}
          {item.reputation_tier_label !== null && item.reputation_tier !== null && (
            <span
              className="bcc-mono shrink-0 rounded-sm px-2 py-0.5 text-[9px] tracking-[0.18em]"
              style={{
                color: `var(--tier-${item.reputation_tier})`,
                background: "var(--bcc-surface-hover)",
                border: "1px solid var(--bcc-border)",
              }}
            >
              {item.reputation_tier_label.toUpperCase()}
            </span>
          )}
        </span>
      </button>
    </li>
  );
}
