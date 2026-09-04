"use client";

/**
 * SubTabNav — the one sub-tab strip for profile panels.
 *
 * Extracted from two near-identical private copies (SetupPanel and BlogPanel,
 * whose own comment said it "mirrors the Setup tab's sub-strip"). The My
 * Profile settings group would have been a third. The visual language is
 * carried over unchanged; the BEHAVIOUR is not, because both copies were
 * missing most of the tabs pattern:
 *
 *   - no `id` / `aria-controls`, so no tab was linked to its panel
 *   - no roving tabIndex, so every tab was a separate tab stop
 *   - no arrow-key handling at all
 *
 * Extraction that preserved those would have laundered a defect into a shared
 * component, so they are fixed here.
 *
 * ## Manual activation, deliberately
 *
 * APG allows automatic activation (selection follows focus) only when
 * switching panels is cheap. It is not cheap here: profile panels are
 * `next/dynamic({ ssr: false })` and fetch on activation, so arrowing across
 * the strip under automatic activation would mount chunks and fire network
 * requests for panels the operator is only passing over. So:
 *
 *   Arrow / Home / End  move FOCUS only, wrapping at both ends
 *   Enter / Space       activate the focused tab
 *
 * Selected and focused therefore diverge while arrowing, which is the correct
 * manual-activation behaviour: `aria-selected` tracks selection, roving
 * `tabIndex` tracks focus.
 *
 * ## Why aria-controls is conditional
 *
 * Only the ACTIVE panel is rendered — that is the whole point of the lazy
 * boundary. `aria-controls` pointing at an id that is not in the DOM is
 * invalid, and rendering every owner editor just to satisfy the reference
 * would defeat both the code-splitting and the privacy boundary. So the
 * attribute is emitted on the selected tab only, where its target exists.
 */

import { useId, useMemo } from "react";

import { useRovingTabs } from "@/hooks/useRovingTabs";
import { TabRail, type TabRailSurface } from "@/components/ui/TabRail";

export interface SubTabDef<K extends string> {
  key: K;
  label: string;
  /**
   * Count badge, rendered after the label. Optional because most strips have
   * nothing to count; omit rather than pass 0, which would print a badge.
   *
   * This lives here because the profile regrouping moved the review tabs out
   * of the parent strip and into a child strip. The badge is the same
   * `.bcc-tab-count` the parent strip renders — the number had to keep its
   * place beside the label, not be dropped on the way down a level.
   */
  count?: number;
  /**
   * §K2 — the owner has hidden this surface from visitors. Renders the PRIVATE
   * chip; the caller is responsible for showing a placeholder instead of the
   * real panel.
   */
  hidden?: boolean;
}

export interface SubTabNavProps<K extends string> {
  tabs: ReadonlyArray<SubTabDef<K>>;
  active: K;
  onSelect: (key: K) => void;
  /** Required — every tablist needs its own name (SetupPanel and the My
   *  Profile group can be on screen in the same session). */
  ariaLabel: string;
  /**
   * Id prefix shared with the panel. Callers that render a panel must set
   * `id={subTabPanelId(idBase, key)}` and `aria-labelledby={subTabId(idBase, key)}`.
   * Omit to let the component mint its own (fine when the caller does not
   * need to reference the ids).
   */
  idBase?: string;
  /**
   * Palette family behind the rail, for the mobile edge fade. Defaults to the
   * theme-aware app surfaces; a strip on the fixed cream paper family must
   * say so, or the gradient fades to the wrong colour.
   */
  surface?: TabRailSurface;
  /**
   * What the SELECTED tab controls, when it is not this strip's own panel.
   *
   * Two strips can sit above one panel. In the settings hierarchy the group
   * strip is a level above the child strip, and only the innermost strip
   * directly controls the panel — so the group strip passes the child's panel
   * id when it IS the innermost (a destination with no children), and `null`
   * when a child strip mediates. Left undefined, the strip points at its own
   * `subTabPanelId(idBase, key)`, which is right for every single-strip
   * caller and is what they all still get.
   *
   * Without this the group strip emitted `aria-controls` for a panel id that
   * nothing rendered — a dangling reference that assistive tech follows to
   * nowhere.
   */
  controlsPanelId?: string | null;
}

export function subTabId(idBase: string, key: string): string {
  return `${idBase}-tab-${key}`;
}

export function subTabPanelId(idBase: string, key: string): string {
  return `${idBase}-panel-${key}`;
}

export function SubTabNav<K extends string>({
  tabs,
  active,
  onSelect,
  ariaLabel,
  idBase,
  surface = "theme",
  controlsPanelId,
}: SubTabNavProps<K>) {
  // useId keeps two instances on one page from colliding. Callers that pass
  // their own idBase win, so they can reference the ids from their panel.
  const generated = useId();
  const base = idBase ?? generated;

  // Keyboard model lives in useRovingTabs so the parent .bcc-tab strip and
  // this one cannot drift apart. Manual activation: arrows move focus,
  // Enter/Space selects.
  const keys = useMemo(() => tabs.map((t) => t.key), [tabs]);
  const { setRef, onKeyDown } = useRovingTabs(keys, onSelect);
  return (
    // TabRail supplies the two things a scrollable rail needs below `sm` and
    // did not have: the selected tab is scrolled into view on mount and on
    // every selection change (useRovingTabs only follows FOCUS, so a deep
    // link left the active tab off-screen), and an edge fade shows the rail
    // continues. Above `sm` the row wraps, nothing overflows, and both go
    // quiet on their own.
    <TabRail activeKey={active} surface={surface}>
    <div
      role="tablist"
      aria-label={ariaLabel}
      // Below `sm`, horizontal scroll keeps every label readable at 360px;
      // -mx-4/px-4 lets the row bleed to the edges so it reads as swipeable
      // rather than clipped.
      //
      // From `sm` up it WRAPS, so every tab is visible without scrolling.
      // That half was missing and the omission hid whole sections: the
      // settings strip is eight tabs, so "Account" (7th) sat past the right
      // edge on a normal laptop with no scrollbar rendered to hint at it —
      // reported as "I can't find Account settings". `overflow-x-auto` goes
      // inert once the row wraps, so the mobile behaviour is unchanged.
      //
      // Matches the parent strip in ProfileTabs and the EntityTabs /
      // GroupTabs strips, which already paired the two.
      className="-mx-4 flex items-center gap-x-1 overflow-x-auto border-b border-bcc-border px-4 sm:mx-0 sm:flex-wrap sm:px-0"
    >
      {tabs.map((tab, index) => {
        const selected = tab.key === active;
        return (
          <button
            key={tab.key}
            ref={setRef(tab.key)}
            type="button"
            role="tab"
            id={subTabId(base, tab.key)}
            aria-selected={selected}
            {...(selected && controlsPanelId !== null
              ? { "aria-controls": controlsPanelId ?? subTabPanelId(base, tab.key) }
              : {})}
            // Roving: exactly one tab stop for the whole strip.
            tabIndex={selected ? 0 : -1}
            onClick={() => onSelect(tab.key)}
            onKeyDown={(e) => onKeyDown(e, index)}
            className={
              "bcc-mono shrink-0 border-b-2 px-4 py-2 transition " +
              (selected
                ? "border-safety text-bcc-text"
                : "border-transparent text-bcc-text-secondary hover:text-bcc-text")
            }
            style={{ fontSize: "12px", letterSpacing: "0.18em" }}
          >
            {tab.label.toUpperCase()}
            {tab.count !== undefined && (
              <span className="bcc-tab-count ml-2">{tab.count}</span>
            )}
            {tab.hidden === true && (
              <span
                className="ml-2 inline-block border border-bcc-border px-1 text-[9px] tracking-[0.18em]"
                aria-label="Private"
              >
                PRIVATE
              </span>
            )}
          </button>
        );
      })}
    </div>
    </TabRail>
  );
}
