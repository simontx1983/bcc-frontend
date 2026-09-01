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

export interface SubTabDef<K extends string> {
  key: K;
  label: string;
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
    <div
      role="tablist"
      aria-label={ariaLabel}
      // Horizontal scroll rather than wrapping keeps every label readable at
      // 360px; -mx-4/px-4 lets the row bleed to the edges so it reads as
      // swipeable instead of clipped.
      className="-mx-4 flex items-center gap-x-1 overflow-x-auto border-b border-bcc-border px-4 sm:mx-0 sm:px-0"
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
            {...(selected
              ? { "aria-controls": subTabPanelId(base, tab.key) }
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
          </button>
        );
      })}
    </div>
  );
}
