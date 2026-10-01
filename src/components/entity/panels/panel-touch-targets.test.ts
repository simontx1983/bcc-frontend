/**
 * Entity panel touch targets.
 *
 * jsdom has no layout, so a rendered test cannot measure a tap target and
 * Tailwind classes are strings until build time. This is the repo's
 * source-scan idiom (see announcement-a11y-and-tokens.test.tsx,
 * weld-confinement.test.ts) for exactly that gap.
 *
 * What it caught: both panels' pagination controls, and the LIST/GRID
 * toggle, were far under 44px — the reviews LOAD MORE was a bare 10px text
 * button with no padding at all, roughly 13px tall. The 36px compact
 * exception is for dense repeated chrome (filter chips, pager chips); a
 * panel's only pagination control and a view switch are primary controls
 * and do not qualify.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const PANEL_FILES = [
  "src/components/entity/panels/CardReviewsPanel.tsx",
  "src/components/entity/panels/CardWatchersPanel.tsx",
] as const;

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

/**
 * Each `<button` chunk up to its closing tag.
 *
 * Split rather than regex the open tag: an `onClick={() => …}` prop contains
 * `>`, so a non-greedy `<button[\s\S]*?>` truncates at the arrow and reads
 * as a button with no attributes.
 */
function buttonRegions(src: string): string[] {
  return src.split("<button").slice(1).map((chunk) => {
    const end = chunk.indexOf("</button>");
    return end === -1 ? chunk : chunk.slice(0, end);
  });
}

describe("the scan actually sees the buttons", () => {
  it("finds every button across both panels", () => {
    // A scan over zero buttons passes vacuously. These two files ship three
    // between them; the floor turns "the split stopped matching" into a
    // failure rather than a silent green.
    const total = PANEL_FILES.reduce(
      (n, f) => n + buttonRegions(read(f)).length,
      0,
    );
    expect(total).toBeGreaterThanOrEqual(3);
  });
});

describe("44px minimum on every interactive control", () => {
  it("declares a 44px minimum height on each button", () => {
    for (const file of PANEL_FILES) {
      const regions = buttonRegions(read(file));
      expect(regions.length).toBeGreaterThan(0);
      for (const region of regions) {
        expect(
          region.includes("min-h-[44px]") ||
            region.includes('minHeight: "44px"'),
          `a <button> in ${file} declares no 44px minimum: ${region.slice(0, 140)}`,
        ).toBe(true);
      }
    }
  });

  it("gives the icon-width view toggle a 44px minimum width too", () => {
    // LIST / GRID are two short words; height alone would leave a control
    // that is tall and thin.
    const src = read("src/components/entity/panels/CardWatchersPanel.tsx");
    const toggle = buttonRegions(src).find((r) => r.includes("aria-pressed"));
    expect(toggle).toBeDefined();
    expect(toggle).toContain("min-w-[44px]");
  });
});

describe("the fix did not inflate the dark panel header", () => {
  it("cancels .bcc-paper-head padding so the strip keeps its height", () => {
    // `.bcc-paper-head` applies 12px vertical padding and centres its row, so
    // two 44px controls would have grown it from ~43px to ~68px. `-my-3`
    // absorbs that; the buttons fill the header's border box instead.
    const src = read("src/components/entity/panels/CardWatchersPanel.tsx");
    const group = src.slice(src.indexOf('aria-label="Watcher view"'));
    expect(group.slice(0, 400)).toContain("-my-3");
  });
});

describe("pagination labels are unchanged", () => {
  it("keeps the accessible names the failure tests select on", () => {
    // accumulator-load-failure.test.tsx finds these by accessible name
    // (/load more/i, /grid/i). Restyling must not rename them.
    expect(read(PANEL_FILES[0])).toContain("LOAD MORE →");
    expect(read(PANEL_FILES[1])).toContain("LOAD MORE");
    expect(read(PANEL_FILES[1])).toContain('{ key: "grid", label: "Grid" }');
  });
});
