/**
 * Live nav chrome contrast — bcc-frontend #74, follow-up audit.
 *
 * #74 asked for two components to follow the theme; both had been deleted
 * as orphans (4379145). The live chrome — SiteHeader, LeftSidebar,
 * MobileNav, MainOffcanvas, and the theme picker (built four times:
 * SiteHeader popover, ThemeSwitcher, MainOffcanvas, LegalThemeToggle) — was
 * audited instead, in both themes and both accents, by computed style in
 * a real browser. Every failing pair fell into one of three shapes, and
 * each is pinned here by its mechanism rather than by a list of lines.
 *
 * 1. FOREGROUND ON A FILLED ACCENT used a fixed light colour: `text-cardstock`
 *    (the unread count badges) or `var(--bcc-white)` (the collapsed New Post
 *    button, the mobile New Post button, the selected Day/Night pill). The
 *    accent grounds are light in BOTH themes (see on-accent-foreground.test),
 *    so white measured 2.39 (blue) / 2.42 (orange). → `--bcc-on-accent`,
 *    7.92 / 7.82.
 *
 * 2. ACCENT USED AS TEXT OR GLYPH on its own 8% tint: the active nav item,
 *    the selected accent option label, the open header icon, the open
 *    offcanvas palette button. 2.22 (blue) / 2.26 (orange) in light. → the
 *    `.bcc-tab` ladder: `--bcc-text` for the label/glyph, and the selection
 *    geometry (bar, outline) on `--bcc-accent-indicator`, which clears 3:1
 *    on the tint in every theme (worst 3.42, dark sidebar).
 *
 * 3. `--bcc-text-muted` AS READABLE TEXT: the mobile nav's inactive labels
 *    and the unselected accent option. 2.43 light / 2.28 dark. The
 *    muted-text closure guard did not see these: its regex rejects a token
 *    flanked by `-` and `)`, which is exactly how `"var(--bcc-text-muted)"`
 *    is spelled in a style object. → `--bcc-text-secondary`, ≥5.62.
 *
 * Out of scope and deliberately untouched: the header search icon, which
 * sits on the frosted `.bcc-search` field whose placeholder is a documented
 * deferral (`--bcc-search-placeholder`, see muted-text-closure.test.ts).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const CSS = read("src/app/globals.css").replace(/\r\n/g, "\n");

const CHROME = [
  "src/components/layout/SiteHeader.tsx",
  "src/components/layout/LeftSidebar.tsx",
  "src/components/layout/nav/MobileNav.tsx",
  "src/components/layout/offcanvas/MainOffcanvas.tsx",
  "src/components/layout/ThemeSwitcher.tsx",
  "src/components/legal/LegalThemeToggle.tsx",
] as const;

const THEME_PICKERS = [
  "src/components/layout/SiteHeader.tsx",
  "src/components/layout/ThemeSwitcher.tsx",
  "src/components/layout/offcanvas/MainOffcanvas.tsx",
  "src/components/legal/LegalThemeToggle.tsx",
] as const;

function rule(selectorLine: string): string {
  const i = CSS.indexOf(selectorLine);
  expect(i, `${selectorLine} not found`).toBeGreaterThan(-1);
  return CSS.slice(i, CSS.indexOf("}", i));
}

// ── colour maths, for the numbers quoted above ─────────────────────────
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const rgb = (h: string) => [0, 2, 4].map((i) => parseInt(h.replace("#", "").slice(i, i + 2), 16));
const lum = (c: number[]) => {
  const [r, g, b] = c.map((v) => lin(v / 255));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const ratio = (a: number[], b: number[]) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const tint = (fg: string, alpha: number, bg: string) =>
  rgb(fg).map((v, i) => v * alpha + (rgb(bg)[i] ?? 0) * (1 - alpha));

describe("preconditions — the scan reads real sources", () => {
  it("reads the stylesheet and every chrome file", () => {
    expect(CSS.length).toBeGreaterThan(100_000);
    for (const f of CHROME) expect(read(f).length, f).toBeGreaterThan(500);
  });
});

describe("1. foreground on a filled accent is --bcc-on-accent", () => {
  it("both header count badges use text-bcc-on-accent, never cardstock", () => {
    const src = read("src/components/layout/SiteHeader.tsx");
    const badges = src.match(/bg-\[var\(--bcc-accent\)\][^"]*/g) ?? [];
    expect(badges).toHaveLength(2);
    for (const b of badges) {
      expect(b).toContain("text-bcc-on-accent");
      expect(b).not.toContain("text-cardstock");
    }
  });

  it("no chrome file puts --bcc-white on the accent", () => {
    for (const f of CHROME) expect(read(f), f).not.toContain("var(--bcc-white)");
  });

  it("every Day/Night pill's selected foreground is --bcc-on-accent", () => {
    for (const f of THEME_PICKERS) {
      expect(read(f), f).toMatch(/=== t \? "var\(--bcc-on-accent\)"/);
    }
  });

  it("the New Post accent buttons draw their glyph in --bcc-on-accent", () => {
    for (const f of ["src/components/layout/LeftSidebar.tsx", "src/components/layout/nav/MobileNav.tsx"]) {
      expect(read(f), f).toMatch(/background: "var\(--bcc-accent\)",\s*color: "var\(--bcc-on-accent\)"/);
    }
  });
});

describe("2. accent is never the text or glyph colour in chrome", () => {
  it("no chrome file colours text or an icon with --bcc-accent", () => {
    for (const f of CHROME) {
      expect(read(f), f).not.toMatch(/color:[^,}\n]*"var\(--bcc-accent\)"/);
    }
  });

  it("the header popovers' action links are not accent text", () => {
    // "See all" (SiteHeader) and "Mark all read" / "LOAD MORE"
    // (NotificationsPanel, rendered inside the bell popover) measured
    // 2.39 blue / 2.42 orange on the light glass panel.
    expect(read("src/components/layout/SiteHeader.tsx")).not.toMatch(/modalSeeAllStyle[^}]*--bcc-accent\)/);
    expect(read("src/components/notifications/NotificationsPanel.tsx")).not.toContain("text-[var(--bcc-accent)]");
  });

  it("the active nav item reads --bcc-text; its bar is the indicator", () => {
    expect(rule(".bcc-nav-item.active {")).toContain("color: var(--bcc-text);");
    expect(rule(".bcc-nav-item.active::before {")).toContain("background: var(--bcc-accent-indicator);");
  });

  it("the selected theme option outlines in the indicator", () => {
    expect(rule(".bcc-theme-option.selected {")).toContain("border-color: var(--bcc-accent-indicator);");
  });

  it("the open offcanvas palette button reads --bcc-text", () => {
    const r = rule(".bcc-offcanvas-palette-btn.active {");
    expect(r).toContain("color: var(--bcc-text);");
    expect(r).toContain("border-color: var(--bcc-accent-indicator);");
  });

  it("the indicator clears 3:1 on the accent tint in every theme", () => {
    const pairs: Array<[string, string]> = [["#1081a3", "#16b5e6"], ["#b95e05", "#f98a1c"]];
    for (const base of ["#ffffff", "#161b22", "#0d1117"]) {
      for (const [indicator, accent] of pairs) {
        expect(ratio(rgb(indicator), tint(accent, 0.08, base))).toBeGreaterThanOrEqual(3);
      }
    }
    // Before: the accent itself on its own tint, light theme.
    expect(ratio(rgb("#16b5e6"), tint("#16b5e6", 0.08, "#ffffff"))).toBeLessThan(2.3);
  });
});

describe("3. --bcc-text-muted is not readable text in chrome", () => {
  it("no chrome file uses the muted token as a colour", () => {
    for (const f of CHROME) expect(read(f), f).not.toContain("var(--bcc-text-muted)");
  });

  it("text-secondary, its replacement, clears 4.5:1 on chrome grounds", () => {
    expect(ratio(rgb("#4b5563"), rgb("#f8f9fa"))).toBeGreaterThanOrEqual(4.5); // light header
    expect(ratio(rgb("#8b949e"), rgb("#0d1117"))).toBeGreaterThanOrEqual(4.5); // dark header
    expect(ratio(rgb("#8b949e"), rgb("#161b22"))).toBeGreaterThanOrEqual(4.5); // dark surface
  });
});
