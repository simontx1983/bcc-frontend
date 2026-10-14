/**
 * Pager chips sit at the house compact size.
 *
 * ## What this pins, and why it is a class assertion
 *
 * jsdom has no layout engine, so a rendered height cannot be measured
 * here. The real heights were measured in a browser instead — 86x30 at
 * 375px on /watching and /messages before this change, 36px tall after —
 * and these cases pin the CLASS CONTRACT that produces them, in the same
 * spirit as `LOAD_FAILURE_TOKENS` being asserted directly rather than
 * through computed styles.
 *
 * ## Why 36 and not 44
 *
 * `bcc-frontend/CLAUDE.md` names this exact control as the exception:
 *
 *   "36px is the sanctioned compact exception for established dense
 *    repeated controls — filter chips, tag chips, pager chips
 *    (`min-h-[36px]`, canonically `FilterChipRow`). Don't generalize 36px
 *    to ordinary or primary buttons."
 *
 * So 44x44 was never the applicable bar for a pager chip. This is a
 * house-consistency change, NOT an accessibility-conformance fix: at 30px
 * these already cleared the web requirement of 24 CSS px.
 *
 * ## The control that matters most
 *
 * Both chips must carry the SAME geometry. Unavailable chips are
 * deliberately kept in the layout so the row does not shift when the
 * viewer reaches the first or last page; if the two chips could differ in
 * height, that property would break in the one state it exists for.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PagerNav } from "@/components/ui/PagerNav";

afterEach(cleanup);

const prev = () => screen.getByRole("button", { name: /PREV/i });
const next = () => screen.getByRole("button", { name: /NEXT/i });

function mount(over: Partial<React.ComponentProps<typeof PagerNav>> = {}) {
  const onPageChange = vi.fn();
  return {
    onPageChange,
    ...render(
      <PagerNav page={2} totalPages={5} onPageChange={onPageChange} {...over} />,
    ),
  };
}

/** The geometry half of the chip class — what decides rendered height. */
const GEOMETRY = ["min-h-[36px]", "inline-flex", "items-center", "py-1.5"];

describe("chip geometry is the house compact size", () => {
  it.each(GEOMETRY)("PREV carries %s", (cls) => {
    mount();
    expect(prev().className).toContain(cls);
  });

  it.each(GEOMETRY)("NEXT carries %s", (cls) => {
    mount();
    expect(next().className).toContain(cls);
  });

  it("does not carry the old 30px padding", () => {
    mount();
    // `py-1` would survive a naive `toContain("py-1")` check because
    // `py-1.5` contains it, so the class list is split and matched exactly.
    const classes = next().className.split(/\s+/);
    expect(classes).not.toContain("py-1");
    expect(classes).toContain("py-1.5");
  });

  it("does not reach for the primary-control size", () => {
    // 44x44 is for primary nav, dialog, form and standalone icon buttons.
    // CLAUDE.md says not to generalize either size to the other's controls.
    mount();
    expect(next().className).not.toContain("min-h-[44px]");
    expect(next().className).not.toContain("h-11");
  });
});

describe("both chips stay the same height as each other", () => {
  it("shares one geometry class string, in every state", () => {
    // The row must not shift when one chip becomes unavailable — the whole
    // reason unavailable chips are kept in the layout.
    const states: Partial<React.ComponentProps<typeof PagerNav>>[] = [
      { page: 2, totalPages: 5 },
      { page: 1, totalPages: 5 },
      { page: 5, totalPages: 5 },
      { page: 2, totalPages: 5, isBusy: true },
      { page: 1, totalPages: 9, hasNext: false },
    ];

    for (const state of states) {
      cleanup();
      mount(state);
      const p = prev().className.split(/\s+/).filter((c) => GEOMETRY.includes(c));
      const n = next().className.split(/\s+/).filter((c) => GEOMETRY.includes(c));
      expect(p.sort()).toEqual(n.sort());
      expect(p).toHaveLength(GEOMETRY.length);
    }
  });

  it("differs between the chips ONLY by the availability tint", () => {
    mount({ page: 1, totalPages: 5 });
    const p = new Set(prev().className.split(/\s+/));
    const n = new Set(next().className.split(/\s+/));
    const onlyOnPrev = [...p].filter((c) => !n.has(c));
    const onlyOnNext = [...n].filter((c) => !p.has(c));

    expect(onlyOnPrev).toEqual(["opacity-40"]);
    expect(onlyOnNext).toEqual([]);
  });
});

describe("#186's protections are untouched by the resize", () => {
  // The resize edits one class string. These re-assert the behaviour that
  // string sits next to, so a future geometry edit cannot quietly take it
  // out — the fuller suites live in pager-nav-focus.test.tsx.
  it("still uses no HTML disabled attribute", () => {
    mount({ page: 1, totalPages: 5, isBusy: true });
    expect(prev()).not.toBeDisabled();
    expect(next()).not.toBeDisabled();
  });

  it("still reports unavailability and busy to assistive technology", () => {
    mount({ page: 1, totalPages: 5, isBusy: true });
    expect(prev()).toHaveAttribute("aria-disabled", "true");
    expect(next()).toHaveAttribute("aria-busy", "true");
  });

  it("still keeps focus on the chip across activation", () => {
    mount();
    const btn = next();
    btn.focus();
    btn.click();
    expect(document.activeElement).toBe(btn);
  });

  it("still refuses a duplicate request", () => {
    const { onPageChange } = mount();
    const btn = next();
    btn.click();
    btn.click();
    btn.click();
    expect(onPageChange).toHaveBeenCalledTimes(1);
  });

  it("still renders nothing below two pages", () => {
    const { container } = mount({ totalPages: 1 });
    expect(container.firstChild).toBeNull();
  });
});
