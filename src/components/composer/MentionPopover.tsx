"use client";

/**
 * MentionPopover — composer @-mention autocomplete dropdown.
 *
 * Anchored under the composer textarea. Driven by the textarea's
 * caret position: when the user types `@<prefix>`, the Composer
 * computes the prefix and feeds it to this popover via the `query`
 * prop. Selection produces the wire-format token (which the Composer
 * splices into the textarea + tracks in its atomic-token range list).
 *
 * Architectural rules honored:
 *   - No business logic. All ranking + privacy filtering is server-
 *     side via `useMentionSearch` → /users/mention-search.
 *   - No raw fetch. Goes through the typed bccFetchAsClient wrapper.
 *   - ARIA combobox primitive — role/aria-expanded/aria-controls/
 *     aria-autocomplete=list/aria-activedescendant + role=listbox +
 *     role=option. Mirrors GlobalSearch.tsx's idiom (V1's reference
 *     combobox in this codebase).
 *   - Keyboard navigation: ↓/↑ cycle, Enter selects, Esc closes.
 *     The popover registers a window-level keydown listener while
 *     open so the textarea can keep focus during navigation.
 *   - Outside-click close (hold textarea focus on close — the
 *     Composer keeps owning input).
 *   - Reduced-motion respect: no animated transitions on the
 *     dropdown (nothing animated by default; we don't add any).
 *
 * V1d shape decisions:
 *   - 8 candidate cap mirrors the server.
 *   - Empty query → no fetch, no dropdown (avoids "type @ to see
 *     everyone" enumeration UX). The Composer should keep the
 *     popover closed until query.length >= 1.
 *   - Avatars ride client-side; fallback emits an empty <img alt="">
 *     on null avatar URL (decorative).
 */

import { useEffect, useState } from "react";

import { Avatar } from "@/components/identity/Avatar";
import { useMentionSearch } from "@/hooks/useMentionSearch";
import type { MentionSearchCandidate } from "@/lib/api/types";

export interface MentionPopoverProps {
  /** Active prefix typed after `@`. Empty string = popover hidden. */
  query: string;
  /** Whether the popover is currently visible (Composer-controlled). */
  open: boolean;
  /** Fires when a candidate is picked (click or Enter). */
  onSelect: (candidate: MentionSearchCandidate) => void;
  /** Fires on Escape, outside-click, or empty-result dismiss. */
  onClose: () => void;
  /**
   * Element the dropdown should consider "inside" for outside-click
   * detection. Typically the composer surface — clicking the textarea
   * to keep typing must NOT close the popover.
   */
  anchorRef: React.RefObject<HTMLElement | null>;
  /**
   * DOM id stamped on the listbox element. Composer pairs this with
   * `aria-controls` on the textarea so the ARIA combobox relationship
   * resolves correctly for screen readers.
   */
  listboxId: string;
  /**
   * Reports the active option's DOM id (or null) so the Composer can
   * mirror it as `aria-activedescendant` on the textarea — the
   * canonical ARIA combobox primitive for "this is the focused row
   * inside the listbox while focus stays on the input."
   */
  onActiveOptionChange?: (optionId: string | null) => void;
}

export function MentionPopover({
  query,
  open,
  onSelect,
  onClose,
  anchorRef,
  listboxId,
  onActiveOptionChange,
}: MentionPopoverProps) {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  const search = useMentionSearch({ query, enabled: open });
  const items: MentionSearchCandidate[] = search.data ?? [];

  // Mirror the active option's id back to the parent so the textarea
  // can stamp `aria-activedescendant`. Empty / loading / error → null.
  useEffect(() => {
    if (onActiveOptionChange === undefined) return;
    if (!open || items.length === 0) {
      onActiveOptionChange(null);
      return;
    }
    const target = items[activeIndex];
    if (target === undefined) {
      onActiveOptionChange(null);
      return;
    }
    onActiveOptionChange(`${listboxId}-opt-${target.user_id}`);
  }, [open, items, activeIndex, listboxId, onActiveOptionChange]);

  // Reset the active index whenever the result list shifts so an
  // out-of-bounds index never renders an invisible focus state.
  // Default to 0 (first row) so Enter is meaningful immediately.
  useEffect(() => {
    setActiveIndex(0);
  }, [items.length, query]);

  // Window-level keyboard handler. Capture-phase so we beat the
  // textarea's default behavior on the navigation keys.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        if (items.length === 0) return;
        event.preventDefault();
        setActiveIndex((prev) => (prev + 1) % items.length);
        return;
      }
      if (event.key === "ArrowUp") {
        if (items.length === 0) return;
        event.preventDefault();
        setActiveIndex((prev) =>
          prev <= 0 ? items.length - 1 : prev - 1
        );
        return;
      }
      if (event.key === "Enter") {
        if (items.length === 0) return;
        const target = items[activeIndex];
        if (target === undefined) return;
        event.preventDefault();
        onSelect(target);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, items, activeIndex, onSelect, onClose]);

  // Outside-click close. The anchor element (composer surface)
  // counts as "inside" so clicking back into the textarea preserves
  // the popover. Clicking outside the composer entirely closes.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const anchor = anchorRef.current;
      if (anchor === null) return;
      if (!(event.target instanceof Node)) return;
      if (anchor.contains(event.target)) return;
      onClose();
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const isEmpty =
    !search.isLoading && !search.isError && items.length === 0 && query !== "";

  return (
    <div
      role="listbox"
      id={listboxId}
      aria-label="Mention suggestions"
      className="flex flex-col rounded-sm border border-cardstock-edge/30 bg-cardstock/5"
    >
      {search.isLoading && (
        <p className="bcc-mono px-3 py-3 text-[11px] text-cardstock-deep/70">
          Searching…
        </p>
      )}
      {search.isError && (
        <p className="bcc-mono px-3 py-3 text-[11px] text-safety">
          Couldn&apos;t load suggestions. Try again.
        </p>
      )}
      {isEmpty && (
        <p className="bcc-mono px-3 py-3 text-[11px] text-cardstock-deep/70">
          No matches for &ldquo;{query}&rdquo;.
        </p>
      )}
      {items.length > 0 && (
        <ul className="flex flex-col" aria-label="People">
          {items.map((c, idx) => {
            const isActive = idx === activeIndex;
            return (
              <li key={c.user_id} role="presentation">
                <button
                  type="button"
                  role="option"
                  id={`${listboxId}-opt-${c.user_id}`}
                  aria-selected={isActive}
                  onClick={() => onSelect(c)}
                  // Hover tracks active index — same pattern as GlobalSearch,
                  // keeps mouse and keyboard navigation coherent.
                  onMouseEnter={() => setActiveIndex(idx)}
                  // No transition on the active-state toggle — the popover
                  // is "temporary expressive enhancement" per the same
                  // product call as the GIF picker; animated row highlight
                  // would fight reduced-motion users.
                  className={`flex items-center gap-2 px-3 py-2 text-left focus:outline-none ${
                    isActive ? "bg-blueprint/10" : "hover:bg-blueprint/5"
                  }`}
                >
                  {/*
                    Sprint 1 Identity Grammar — adopting the shared
                    Avatar at xs (20px) here would be too tight in a
                    24px-tall row; xs is for reaction stacks. Using
                    sm (28px) with initials fallback gives the popover
                    a faces-first feel; previously only candidates with
                    avatars rendered a chip, which silently hid identity.
                  */}
                  <Avatar
                    avatarUrl={c.avatar_url === "" ? null : c.avatar_url}
                    handle={c.handle}
                    displayName={c.display_name}
                    size="xs"
                    variant="rounded"
                  />
                  <span className="flex flex-col">
                    <span className="text-[12px] text-cardstock">
                      {c.display_name}
                    </span>
                    <span className="bcc-mono text-[10px] tracking-[0.06em] text-cardstock-deep/70">
                      @{c.handle}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}