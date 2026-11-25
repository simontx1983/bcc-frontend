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
 * seventh partial implementation, the keyboard contract lives once, in
 * `useMenuButton` (F-264: shared with PostOverflowMenu, which keeps its
 * own "⋯" markup). This component is the labelled, grouped rendering.
 *
 * Deliberately narrow: a trigger, optional labelled groups, and items.
 * No submenus, no checkable items, no typeahead, no portal — the profile
 * caption is a normal flow container and the menu is short enough that
 * arrow keys and Home/End cover it.
 *
 * ## Keyboard contract (APG menu button, implemented in useMenuButton)
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

import type { ReactNode } from "react";

import { useMenuButton } from "@/hooks/useMenuButton";

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
  // Flat, in DOM order — arrow keys cross group boundaries, as the
  // pattern requires.
  const flat = groups.flatMap((g) => g.items);
  const menu = useMenuButton({
    itemCount: flat.length,
    isDisabled: (i) => flat[i]?.disabled === true,
    disabled,
  });

  function select(item: ActionMenuItem) {
    if (item.disabled === true) return;
    // Close BEFORE the action runs (see useMenuButton's closeThen), so a
    // file picker, a reposition panel or a confirmation dialog never opens
    // behind a menu that is still painted. Focus is NOT pulled back: the
    // action owns it from here — a dialog traps it, and a removal hands it
    // to the control that replaces the one that unmounted.
    menu.closeThen(item.onSelect);
  }

  let flatIndex = -1;

  return (
    <div className={`relative ${className ?? ""}`}>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          ref={menu.triggerRef}
          disabled={disabled}
          aria-haspopup="menu"
          aria-expanded={menu.open}
          aria-controls={menu.open ? menu.menuId : undefined}
          onClick={menu.toggle}
          onKeyDown={menu.onTriggerKeyDown}
          className="bcc-mono inline-flex min-h-[36px] items-center gap-2 border border-bcc-border bg-bcc-surface px-3 py-1.5 text-[10px] tracking-[0.16em] text-bcc-text transition hover:bg-bcc-surface-hover disabled:cursor-wait disabled:opacity-50"
        >
          {triggerLabel}
          <span aria-hidden>⋯</span>
        </button>
        {after}
      </div>

      {menu.open && (
        <div
          id={menu.menuId}
          ref={menu.menuRef}
          role="menu"
          aria-label={triggerLabel}
          onKeyDown={menu.onMenuKeyDown}
          className="absolute left-0 z-30 mt-1 min-w-[220px] max-w-[calc(100vw-2rem)] border border-bcc-border bg-bcc-surface-raised p-1 shadow-lg"
        >
          {groups.map((group) => {
            const groupLabelId = `${menu.menuId}-${group.id}`;
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
                      ref={menu.itemRef(i)}
                      tabIndex={i === menu.activeIndex ? 0 : -1}
                      disabled={item.disabled === true}
                      onClick={() => select(item)}
                      onMouseEnter={() => menu.hover(i)}
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
