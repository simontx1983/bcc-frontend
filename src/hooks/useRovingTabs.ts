"use client";

/**
 * useRovingTabs — the APG tabs keyboard model, shared by the two profile tab
 * strips.
 *
 * The parent strip (`.bcc-tab`, 13px stencil) and the sub strip
 * (`.bcc-mono`, 12px) are deliberately different visual tiers, so they are
 * not one component. The BEHAVIOUR is identical though, and neither had any
 * of it before — no arrow keys, no roving tabIndex, every tab its own tab
 * stop. This hook is the shared half.
 *
 * ## Manual activation
 *
 * Arrow / Home / End move FOCUS only; Enter / Space activate. APG permits
 * automatic activation (selection following focus) only when switching panels
 * is cheap, and here it is not: profile panels are `next/dynamic({ssr:false})`
 * and fetch on activation, so arrowing under automatic activation would mount
 * chunks and fire requests for panels the operator is merely passing over —
 * and would rewrite the `?tab=` query on every keypress.
 *
 * Consequence, and it is the correct one: focus and selection diverge while
 * arrowing. `aria-selected` tracks selection; `tabIndex` tracks focus.
 */

import { useCallback, useRef, type KeyboardEvent } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";

export interface RovingTabs<K extends string> {
  /** Ref callback for each tab button, keyed. */
  setRef: (key: K) => (el: HTMLButtonElement | null) => void;
  /** Attach to each tab button; `index` is its position in `keys`. */
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
}

export function useRovingTabs<K extends string>(
  keys: ReadonlyArray<K>,
  onActivate: (key: K) => void,
): RovingTabs<K> {
  const reducedMotion = usePrefersReducedMotion();
  const refs = useRef<Map<K, HTMLButtonElement>>(new Map());

  const setRef = useCallback(
    (key: K) => (el: HTMLButtonElement | null) => {
      if (el === null) refs.current.delete(key);
      else refs.current.set(key, el);
    },
    [],
  );

  const focusTab = useCallback(
    (key: K) => {
      const el = refs.current.get(key);
      if (el === undefined) return;
      el.focus();
      // Both strips are horizontal scroll containers at narrow widths.
      // Follow FOCUS, not selection — under manual activation they differ,
      // and it is the focused tab that must stay visible.
      el.scrollIntoView({
        behavior: reducedMotion ? "auto" : "smooth",
        block: "nearest",
        inline: "nearest",
      });
    },
    [reducedMotion],
  );

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
      const last = keys.length - 1;
      if (last < 0) return;

      let next: number;
      switch (event.key) {
        case "ArrowRight":
          next = index === last ? 0 : index + 1;
          break;
        case "ArrowLeft":
          next = index === 0 ? last : index - 1;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = last;
          break;
        case "Enter":
        case " ":
          // Space scrolls the page by default; Enter on a <button> would
          // re-fire click. Own both so activation is explicit.
          event.preventDefault();
          onActivate(keys[index]!);
          return;
        default:
          return;
      }

      event.preventDefault();
      focusTab(keys[next]!);
    },
    [keys, onActivate, focusTab],
  );

  return { setRef, onKeyDown };
}
