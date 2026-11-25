"use client";

/**
 * useMenuButton — the WAI-ARIA menu-button keyboard and focus contract,
 * kept in one place for every menu button: ActionMenu (a labelled trigger
 * with groups) and PostOverflowMenu (the feed's "⋯"). Each component keeps
 * its own markup; this hook owns only the open state, the refs and the
 * handlers it wires onto that markup.
 *
 * ## Keyboard contract (APG menu button)
 *
 *   Trigger  Enter / Space / ArrowDown → open, focus FIRST item
 *            ArrowUp                   → open, focus LAST item
 *            click / tap               → open, focus first item
 *   Menu     ArrowDown / ArrowUp       → move, wrapping
 *            Home / End                → first / last
 *            Escape                    → close, focus returns to trigger
 *            Tab                       → close (focus proceeds naturally)
 *            outside press             → close
 *
 * Disabled items are skipped by arrow navigation rather than focused and
 * then refused, so a keyboard user never lands somewhere inert. Moving the
 * pointer over an enabled item makes it the active one.
 *
 * Choosing an item goes through `closeThen`: the menu closes first, then
 * the action runs. Focus goes back to the trigger only when asked
 * (`returnFocus`), e.g. before opening a dialog, which then restores focus
 * to the trigger when it closes; otherwise the action owns focus.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";

export interface UseMenuButtonOptions {
  /** How many items the menu renders, in DOM order. */
  itemCount: number;
  /** Whether the item at this index is disabled (skipped by the keys). */
  isDisabled?: (index: number) => boolean;
  /** A disabled trigger opens nothing. */
  disabled?: boolean;
}

export interface MenuButton {
  /** For the menu's `id` and the trigger's `aria-controls`. */
  menuId: string;
  open: boolean;
  /** The item that holds the roving tabindex (0); the rest get -1. */
  activeIndex: number;
  triggerRef: RefObject<HTMLButtonElement | null>;
  menuRef: RefObject<HTMLDivElement | null>;
  /** A ref callback for the item at `index`. */
  itemRef: (index: number) => (el: HTMLButtonElement | null) => void;
  /** The trigger's click: open at the first item, or close. */
  toggle: () => void;
  close: (returnFocus: boolean) => void;
  onTriggerKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
  onMenuKeyDown: (e: KeyboardEvent<HTMLDivElement>) => void;
  /** The item's pointer-enter: make it active, unless it is disabled. */
  hover: (index: number) => void;
  /** Close the menu, then run the chosen item's action. */
  closeThen: (action: () => void, options?: { returnFocus?: boolean }) => void;
}

export function useMenuButton({
  itemCount,
  isDisabled,
  disabled = false,
}: UseMenuButtonOptions): MenuButton {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const enabledIndexes: number[] = [];
  for (let i = 0; i < itemCount; i += 1) {
    if (isDisabled?.(i) !== true) enabledIndexes.push(i);
  }

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  function openAt(where: "first" | "last") {
    if (disabled || enabledIndexes.length === 0) return;
    const next =
      where === "first" ? enabledIndexes[0] : enabledIndexes[enabledIndexes.length - 1];
    setActiveIndex(next ?? 0);
    setOpen(true);
  }

  // Move DOM focus to the active item whenever it changes while open.
  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  // Outside press. Pointerdown rather than click so a press that starts
  // outside cannot select an item that moves under the cursor.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) === true) return;
      if (triggerRef.current?.contains(t) === true) return;
      close(false);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open, close]);

  // An open menu whose items all became disabled (a save started) has
  // nothing left to operate on.
  useEffect(() => {
    if (open && enabledIndexes.length === 0) close(true);
  }, [open, enabledIndexes.length, close]);

  function step(delta: number) {
    if (enabledIndexes.length === 0) return;
    const pos = enabledIndexes.indexOf(activeIndex);
    const nextPos =
      pos === -1 ? 0 : (pos + delta + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[nextPos] ?? 0);
  }

  function onTriggerKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAt("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openAt("last");
    }
  }

  function onMenuKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        step(1);
        break;
      case "ArrowUp":
        e.preventDefault();
        step(-1);
        break;
      case "Home":
        e.preventDefault();
        setActiveIndex(enabledIndexes[0] ?? 0);
        break;
      case "End":
        e.preventDefault();
        setActiveIndex(enabledIndexes[enabledIndexes.length - 1] ?? 0);
        break;
      case "Escape":
        e.preventDefault();
        close(true);
        break;
      case "Tab":
        // Let focus proceed; just don't leave an orphaned open menu.
        close(false);
        break;
      default:
        break;
    }
  }

  function closeThen(action: () => void, options: { returnFocus?: boolean } = {}) {
    // Close BEFORE the action runs, so a file picker, a panel or a dialog
    // never opens behind a menu that is still painted.
    //
    // `flushSync` is load-bearing, not defensive. A bare `setOpen(false)`
    // is batched, so the action ran while the menu was still mounted: the
    // file dialog opened over an open menu, and a confirmation dialog took
    // focus with the menu still behind it. Flushing commits the close first
    // while staying inside the same user gesture, which a file input's
    // `.click()` requires.
    flushSync(() => setOpen(false));
    if (options.returnFocus === true) triggerRef.current?.focus();
    action();
  }

  return {
    menuId,
    open,
    activeIndex,
    triggerRef,
    menuRef,
    itemRef: (index) => (el) => {
      itemRefs.current[index] = el;
    },
    toggle: () => (open ? close(false) : openAt("first")),
    close,
    onTriggerKeyDown,
    onMenuKeyDown,
    hover: (index) => {
      if (isDisabled?.(index) !== true) setActiveIndex(index);
    },
    closeThen,
  };
}
