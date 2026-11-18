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
 * The header search icon and placeholder were left out of that pass and
 * fixed in #202; see section 4.
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

  // The mobile bar is now a solid page-ground bar (Handoff v1), not the
  // translucent header glass — so its labels sit on --bcc-bg itself. Read
  // the real ground from the stylesheet so a token change re-measures.
  it("the mobile bar sits on the opaque --bcc-bg, and its labels clear 4.5:1 on it", () => {
    const nav = read("src/components/layout/nav/MobileNav.tsx");
    expect(nav).toContain('background: "var(--bcc-bg)"');
    expect(nav).not.toContain("var(--bcc-header-bg)");
    const tokens = (n: string) =>
      [...CSS.matchAll(new RegExp(`--${n}:\\s*(#[0-9a-fA-F]{6});`, "g"))].map((m) => m[1] ?? "");
    const bg = tokens("bcc-bg");
    const secondary = tokens("bcc-text-secondary");
    const text = tokens("bcc-text");
    // Scope 0 = light :root, last = [data-theme="dark"].
    for (const i of [0, bg.length - 1]) {
      const ground = rgb(bg[i] ?? "");
      expect(ratio(rgb(secondary[i] ?? ""), ground)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(rgb(text[i] ?? ""), ground)).toBeGreaterThanOrEqual(4.5);
    }
  });
});

/**
 * #202 — the header search field.
 *
 * The field was carved out as "unbounded" because it is frosted glass. It
 * is bounded: 10% glass over the header's translucent fill over the page,
 * and an opaque fill on focus. Every value below is read from globals.css
 * and composited here, so a token change re-measures itself.
 */
describe("4. header search field (#202)", () => {
  const values = (n: string) =>
    [...CSS.matchAll(new RegExp(`--${n}:\\s*([^;]+);`, "g"))].map((m) => m[1]?.trim() ?? "");
  /** `rgba(r,g,b,a)` or `#rrggbb` → [rgb, alpha]. */
  const parse = (v: string): [number[], number] => {
    const m = /rgba\(([^)]+)\)/.exec(v);
    if (m === null) return [rgb(v), 1];
    const parts = (m[1] ?? "").split(",").map((s) => Number(s.trim()));
    return [parts.slice(0, 3), parts[3] ?? 1];
  };
  const over = (top: string, under: number[]) => {
    const [c, a] = parse(top);
    return c.map((v, i) => v * a + (under[i] ?? 0) * (1 - a));
  };
  // Scope 0 = light :root, scope 2 = [data-theme="dark"].
  const ground = (scope: number) => {
    const page = rgb(values("bcc-bg")[scope] ?? "");
    const header = over(values("bcc-header-bg")[scope] ?? "", page);
    return {
      resting: over(values("bcc-glass-bg-frosted")[scope] ?? "", header),
      focused: rgb(values("bcc-input-bg-focus")[scope] ?? ""),
    };
  };
  const THEMES = [["light", 0], ["dark", 2]] as const;

  it("the icon rests on secondary and the placeholder on the general token", () => {
    expect(rule(".bcc-search-icon {")).toContain("color: var(--bcc-text-secondary)");
    expect(rule(".bcc-search-input::placeholder {")).toContain("color: var(--bcc-text-placeholder)");
  });

  for (const [theme, scope] of THEMES) {
    it(`${theme}: the icon clears 3:1, resting and focused`, () => {
      const icon = rgb(values("bcc-text-secondary")[scope] ?? "");
      const g = ground(scope);
      expect(ratio(icon, g.resting)).toBeGreaterThanOrEqual(3);
      expect(ratio(icon, g.focused)).toBeGreaterThanOrEqual(3);
    });

    it(`${theme}: the placeholder clears 4.5:1, resting and focused`, () => {
      const ph = rgb(values("bcc-text-placeholder")[scope] ?? "");
      const g = ground(scope);
      expect(ratio(ph, g.resting)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(ph, g.focused)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it("the old values failed on the same grounds (the control)", () => {
    expect(ratio(rgb("#9ca3af"), ground(0).resting)).toBeLessThan(3); // old icon, light
    expect(ratio(rgb("#484f58"), ground(2).resting)).toBeLessThan(3); // old icon, dark
    expect(ratio(rgb("#b3b8c3"), ground(0).resting)).toBeLessThan(4.5); // old placeholder, light
    expect(ratio(rgb("#82878f"), rgb("#1c2128"))).toBeLessThan(4.5); // old dark focus fill
  });
});

/**
 * #209 — the dark header over bright content.
 *
 * The header is glass: its fill is translucent, so whatever scrolls under
 * it shows through. The worst case is pure white beneath (paper cards,
 * photos). At 0.55 that dropped dark header text to 3.54:1 and secondary
 * text to 1.36:1. The dark fill is now 0.90.
 */
describe("5. dark header over bright content (#209)", () => {
  const darkFill = [...CSS.matchAll(/--bcc-header-bg:\s*rgba\(([^)]+)\)/g)]
    .map((m) => (m[1] ?? "").split(",").map((s) => Number(s.trim())))
    .filter((p) => (p[0] ?? 255) < 128); // the dark scopes
  const overWhite = (p: number[]) => {
    const a = p[3] ?? 1;
    return [0, 1, 2].map((i) => (p[i] ?? 0) * a + 255 * (1 - a));
  };

  it("both dark scopes declare the 0.90 fill", () => {
    expect(darkFill).toHaveLength(2);
    for (const p of darkFill) expect(p).toEqual([13, 17, 23, 0.9]);
  });

  it("text and secondary text clear 4.5:1 with white beneath", () => {
    for (const p of darkFill) {
      const ground = overWhite(p);
      expect(ratio(rgb("#e6edf3"), ground)).toBeGreaterThanOrEqual(4.5); // --bcc-text, dark
      expect(ratio(rgb("#8b949e"), ground)).toBeGreaterThanOrEqual(4.5); // --bcc-text-secondary, dark
    }
  });

  it("the old 0.55 fill failed on the same ground (the control)", () => {
    const old = overWhite([13, 17, 23, 0.55]);
    expect(ratio(rgb("#e6edf3"), old)).toBeLessThan(4.5);
    expect(ratio(rgb("#8b949e"), old)).toBeLessThan(4.5);
  });
});
