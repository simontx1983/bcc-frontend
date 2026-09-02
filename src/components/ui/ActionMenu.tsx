"use client";

/**
 * ActionMenu — a labelled menu button following the WAI-ARIA menu-button
 * pattern.
 *
 * ## Why this exists
 *
 * Nothing in the repo was reusable for this. `PostOverflowMenu` is bound
 * to `FeedItem` and hardcodes copy-link / report / delete; the other
 * `aria-haspopup` sites (ShareButton, SiteHeader, NotificationsPanel,
 * RankChip, CommentDrawer, TourLayer) each hand-roll open/close with no
 * arrow-key navigation and no guaranteed focus return. Rather than add a
 * seventh partial implementation, the keyboard contract lives here once.
 *
 * Deliberately narrow: a trigger, optional labelled groups, and items.
 * No submenus, no checkable items, no typeahead, no portal — the profile
 * caption is a normal flow container and the menu is short enough that
 * arrow keys and Home/End cover it.
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
 *            outside click             → close
 *
 * Disabled items are skipped by arrow navigation rather than focused and
 * then refused, so a keyboard user never lands somewhere inert.
 *
 * Hover opens nothing. That is the whole point: the controls this
 * replaced were hover-revealed overlays, invisible on touch.
 */

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

export interface ActionMenuItem {
  /** Stable within one menu; used as the React key. */
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** Renders the safety leading-edge mark. Destructive actions only. */
  destructive?: boolean;
}

export interface ActionMenuGroup {
  id: string;
  /** Rendered as the group's accessible name. */
  label: string;
  items: ActionMenuItem[];
}

export interface ActionMenuProps {
  /** Visible trigger text. Never icon-only — see the header note. */
  triggerLabel: string;
  groups: ActionMenuGroup[];
  /** Rendered inside the trigger after the label, e.g. a status region. */
  after?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function ActionMenu({
  triggerLabel,
  groups,
  after,
  disabled = false,
  className,
}: ActionMenuProps) {
  const menuId = useId();
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** Set when closing should NOT pull focus back (item selected). */
  const skipFocusReturn = useRef(false);

  // Flat, in DOM order — arrow keys cross group boundaries, as the
  // pattern requires.
  const flat = groups.flatMap((g) => g.items);
  const enabledIndexes = flat
    .map((it, i) => (it.disabled === true ? -1 : i))
    .filter((i) => i >= 0);

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus && !skipFocusReturn.current) triggerRef.current?.focus();
    skipFocusReturn.current = false;
  }, []);

  const openAt = useCallback(
    (where: "first" | "last") => {
      if (disabled || enabledIndexes.length === 0) return;
      const next =
        where === "first"
          ? enabledIndexes[0]
          : enabledIndexes[enabledIndexes.length - 1];
      setActiveIndex(next ?? 0);
      setOpen(true);
    },
    [disabled, enabledIndexes],
  );

  // Move DOM focus to the active item whenever it changes while open.
  useEffect(() => {
    if (!open) return;
    itemRefs.current[activeIndex]?.focus();
  }, [open, activeIndex]);

  // Outside click. Pointerdown rather than click so a press that starts
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
      pos === -1
        ? 0
        : (pos + delta + enabledIndexes.length) % enabledIndexes.length;
    setActiveIndex(enabledIndexes[nextPos] ?? 0);
  }

  function onTriggerKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openAt("first");
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      openAt("last");
    }
  }

  function onMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
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

  function select(item: ActionMenuItem) {
    if (item.disabled === true) return;
    // Close BEFORE the action runs, so a file picker, a reposition panel
    // or a confirmation dialog never opens behind a menu that is still
    // painted. Focus return is skipped because the action owns focus from
    // here — a dialog traps it, and a removal hands it to the control
    // that replaces the one that unmounted.
    //
    // `flushSync` is load-bearing, not defensive. A bare `setOpen(false)`
    // is batched, so `onSelect()` ran while the menu was still mounted —
    // the file dialog opened over an open menu, and a confirmation dialog
    // took focus with the menu still behind it. Flushing commits the close
    // first while staying inside the same user gesture, which the file
    // input's `.click()` requires.
    skipFocusReturn.current = true;
    flushSync(() => setOpen(false));
    item.onSelect();
  }

  let flatIndex = -1;

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          ref={triggerRef}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          onClick={() => (open ? close(false) : openAt("first"))}
          onKeyDown={onTriggerKeyDown}
          className="bcc-mono inline-flex min-h-[36px] items-center gap-2 border border-bcc-border bg-bcc-surface px-3 py-1.5 text-[10px] tracking-[0.16em] text-bcc-text transition hover:bg-bcc-surface-hover disabled:cursor-wait disabled:opacity-50"
        >
          {triggerLabel}
          <span aria-hidden>⋯</span>
        </button>
        {after}
      </div>

      {open && (
        <div
          id={menuId}
          ref={menuRef}
          role="menu"
          aria-label={triggerLabel}
          onKeyDown={onMenuKeyDown}
          className="absolute left-0 z-30 mt-1 min-w-[220px] max-w-[calc(100vw-2rem)] border border-bcc-border bg-bcc-surface-raised p-1 shadow-lg"
        >
          {groups.map((group) => {
            const groupLabelId = `${menuId}-${group.id}`;
            return (
              <div key={group.id} role="group" aria-labelledby={groupLabelId}>
                <p
                  id={groupLabelId}
                  className="bcc-mono px-2 pb-1 pt-2 text-[9px] tracking-[0.2em] text-bcc-text-secondary"
                >
                  {group.label}
                </p>
                {group.items.map((item) => {
                  flatIndex += 1;
                  const i = flatIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      ref={(el) => {
                        itemRefs.current[i] = el;
                      }}
                      tabIndex={i === activeIndex ? 0 : -1}
                      disabled={item.disabled === true}
                      onClick={() => select(item)}
                      onMouseEnter={() => {
                        if (item.disabled !== true) setActiveIndex(i);
                      }}
                      className={`block w-full px-2 py-2 text-left font-serif text-[13px] text-bcc-text transition hover:bg-bcc-surface-hover focus:bg-bcc-surface-hover focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
                        item.destructive === true
                          ? "mt-1 border-l-[3px] border-l-safety"
                          : ""
                      }`}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
