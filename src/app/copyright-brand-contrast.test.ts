/**
 * Copyright mark — readable brand text.
 *
 * `.bcc-copyright` was the last selector still resting on
 * `--bcc-text-muted` (2.54:1 light / 2.28:1 dark), and two of its three
 * hover words used the raw brand constants `--bcc-primary` /
 * `--bcc-secondary`, which measure 2.39:1 and 2.42:1 on a light page.
 *
 * ## Why theme-scoped tokens rather than one fixed pair
 *
 * No single value per word clears 4.5:1 in BOTH themes — the best
 * hue-preserving cyan reaches 4.14 and the best orange 4.15. Theme
 * scoping is therefore mandatory here, unlike `--bcc-focus-ring`, where
 * one value sufficed because the indicator bar is 3:1. The bright brand
 * values already clear 4.5:1 on dark surfaces, so they carry over
 * unchanged and only light needs darker variants.
 *
 * ## Why NOT accent-scoped
 *
 * The pairing IS the brand: the mark echoes `.bcc-brand-top` (cyan) and
 * `.bcc-brand-bottom` (orange) in the header wordmark. Defining these in
 * the accent scopes would mean that selecting the orange accent turns
 * BOTH words orange and the two-tone disappears. They live in the theme
 * scopes for that reason, and the tests below prove `data-accent` cannot
 * reach them.
 *
 * ## The year's hover is not incidental
 *
 * Moving the resting state to `--bcc-text-secondary` collides with the
 * year's old hover colour, which was also secondary — hover would have
 * become a visual no-op. The year rises to `--bcc-text` in the same
 * change, the same correction E1b made for the three link ladders.
 *
 * These are READABLE TEXT tokens at 4.5:1. They must never be used for
 * focus rings, borders, selected indicators, backgrounds or shadows —
 * asserted below.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");
const NCSS = CSS.replace(/\r\n/g, "\n");

// ── colour maths ──────────────────────────────────────────────────────

type RGB = readonly [number, number, number];

function hex(h: string): RGB {
  const s = h.trim().replace("#", "");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ] as const;
}

function luminance(c: RGB): number {
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0] / 255) + 0.7152 * lin(c[1] / 255) + 0.0722 * lin(c[2] / 255);
}

function ratio(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function over(fg: RGB, alpha: number, bg: RGB): RGB {
  return [0, 1, 2].map((i) => Math.round((fg[i] ?? 0) * alpha + (bg[i] ?? 0) * (1 - alpha))) as
    unknown as RGB;
}

const WHITE = hex("#ffffff");
const NIGHT = hex("#0d1117");

/**
 * Every surface the mark actually renders on. Six consumers —
 * marketing footer, NotFoundContent, LeftSidebar, MainOffcanvas,
 * MinimalShell's auth footer, and LegalDoc — none of which sets a
 * background of its own, so each inherits page, sidebar or glass.
 */
const LIGHT_BACKGROUNDS: ReadonlyArray<readonly [string, RGB]> = [
  ["page / sidebar (light)", WHITE],
  ["glass composited (light)", over(WHITE, 0.62, WHITE)],
];

const DARK_BACKGROUNDS: ReadonlyArray<readonly [string, RGB]> = [
  ["page (dark)", NIGHT],
  ["sidebar / panel (dark)", hex("#161b22")],
  ["glass composited (dark)", over(hex("#161b22"), 0.62, NIGHT)],
];

const TEXT_MIN = 4.5;

/** Read a token from a specific scope block. */
function tokenIn(scopeAnchor: string, name: string): string {
  const i = NCSS.indexOf(scopeAnchor);
  if (i < 0) throw new Error(`scope ${scopeAnchor} not found`);
  const block = NCSS.slice(i, NCSS.indexOf("\n}", i));
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(block);
  if (m?.[1] === undefined) throw new Error(`--${name} not in ${scopeAnchor}`);
  return m[1].trim();
}

function rule(selector: string): string {
  const i = NCSS.indexOf(selector);
  if (i < 0) throw new Error(`selector ${selector} not found`);
  return NCSS.slice(i, NCSS.indexOf("}", i));
}

const LIGHT = { cyan: "#0f799a", orange: "#ae5905" } as const;
const DARK = { cyan: "#16b5e6", orange: "#f98a1c" } as const;

// ── token definitions ─────────────────────────────────────────────────

describe("brand-text tokens exist in every theme scope", () => {
  it("cyan is defined three times — light, media-dark, data-theme-dark", () => {
    const all = [...NCSS.matchAll(/--bcc-brand-text-cyan:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(all).toEqual([LIGHT.cyan, DARK.cyan, DARK.cyan]);
  });

  it("orange is defined three times — light, media-dark, data-theme-dark", () => {
    const all = [...NCSS.matchAll(/--bcc-brand-text-orange:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(all).toEqual([LIGHT.orange, DARK.orange, DARK.orange]);
  });

  it("the light scope carries the darker readable variants", () => {
    expect(tokenIn('[data-theme="light"] {', "bcc-brand-text-cyan")).toBe(LIGHT.cyan);
    expect(tokenIn('[data-theme="light"] {', "bcc-brand-text-orange")).toBe(LIGHT.orange);
  });

  it("the dark scope preserves the existing bright brand values", () => {
    expect(tokenIn('[data-theme="dark"] {', "bcc-brand-text-cyan")).toBe(DARK.cyan);
    expect(tokenIn('[data-theme="dark"] {', "bcc-brand-text-orange")).toBe(DARK.orange);
    // identical to the untouched brand constants
    expect(NCSS).toContain("--bcc-primary:         #16b5e6;");
    expect(NCSS).toContain("--bcc-secondary:       #f98a1c;");
  });
});

describe("the tokens are theme-scoped, never accent-scoped", () => {
  for (const accent of ['[data-accent="primary"]', '[data-accent="secondary"]']) {
    it(`${accent} does not define either token`, () => {
      const i = NCSS.indexOf(accent);
      const block = NCSS.slice(i, NCSS.indexOf("\n}", i));
      expect(block).not.toContain("--bcc-brand-text-cyan");
      expect(block).not.toContain("--bcc-brand-text-orange");
    });
  }

  it("changing data-accent cannot alter the two-tone pair", () => {
    // Neither token is derived from --bcc-accent (or from anything the
    // accent switcher touches), so the pairing is accent-invariant. If
    // they were accent-scoped, an orange accent would make BOTH words
    // orange and the wordmark echo would vanish.
    const defs = [
      ...NCSS.matchAll(/--bcc-brand-text-(?:cyan|orange):\s*([^;]+);/g),
    ].map((m) => m[1]?.trim() ?? "");
    for (const d of defs) {
      expect(d).toMatch(/^#[0-9a-f]{6}$/i); // literal, not var(--bcc-accent…)
      expect(d).not.toContain("accent");
    }
  });

  it("cyan and orange are genuinely different colours in both themes", () => {
    // Guards the whole point of the pairing: if a later edit collapsed
    // them toward one hue this fails, even if both still pass contrast.
    for (const pair of [LIGHT, DARK]) {
      expect(pair.cyan).not.toBe(pair.orange);
      // blue channel dominant for cyan, red channel dominant for orange
      const c = hex(pair.cyan);
      const o = hex(pair.orange);
      expect(c[2]).toBeGreaterThan(c[0]);
      expect(o[0]).toBeGreaterThan(o[2]);
    }
  });
});

// ── contrast ──────────────────────────────────────────────────────────

describe("both brand-text tokens clear 4.5:1 on every copyright background", () => {
  for (const [label, bg] of LIGHT_BACKGROUNDS) {
    it(`light cyan on ${label}`, () => {
      expect(ratio(hex(LIGHT.cyan), bg)).toBeGreaterThanOrEqual(TEXT_MIN);
    });
    it(`light orange on ${label}`, () => {
      expect(ratio(hex(LIGHT.orange), bg)).toBeGreaterThanOrEqual(TEXT_MIN);
    });
  }
  for (const [label, bg] of DARK_BACKGROUNDS) {
    it(`dark cyan on ${label}`, () => {
      expect(ratio(hex(DARK.cyan), bg)).toBeGreaterThanOrEqual(TEXT_MIN);
    });
    it(`dark orange on ${label}`, () => {
      expect(ratio(hex(DARK.orange), bg)).toBeGreaterThanOrEqual(TEXT_MIN);
    });
  }

  it("the raw brand constants would NOT have passed in light", () => {
    // Documents why the tokens exist. If --bcc-primary is ever darkened
    // enough to pass, this batch is worth revisiting.
    expect(ratio(hex("#16b5e6"), WHITE)).toBeLessThan(TEXT_MIN);
    expect(ratio(hex("#f98a1c"), WHITE)).toBeLessThan(TEXT_MIN);
  });

  it("no single value per word could have served both themes", () => {
    // The reason this is theme-scoped at all: cyan tops out at ~4.14 and
    // orange at ~4.15 when forced to satisfy white AND near-black.
    const worst = (v: string) =>
      Math.min(
        ...[...LIGHT_BACKGROUNDS, ...DARK_BACKGROUNDS].map(([, bg]) => ratio(hex(v), bg)),
      );
    expect(worst(LIGHT.cyan)).toBeLessThan(TEXT_MIN);
    expect(worst(DARK.cyan)).toBeLessThan(TEXT_MIN);
  });
});

// ── the ladder ────────────────────────────────────────────────────────

describe("the copyright ladder", () => {
  it("resting uses secondary", () => {
    expect(rule(".bcc-copyright {")).toContain("color: var(--bcc-text-secondary);");
  });

  it("hovered year uses primary text, not secondary", () => {
    const r = rule(".bcc-copyright:hover .bcc-copyright-year {");
    expect(r).toContain("color: var(--bcc-text);");
    // If this regressed to secondary it would match the resting state and
    // the hover would be invisible.
    expect(r).not.toContain("var(--bcc-text-secondary)");
  });

  it("hovered collar uses brand-text cyan", () => {
    expect(rule(".bcc-copyright:hover .bcc-copyright-collar {")).toContain(
      "color: var(--bcc-brand-text-cyan);",
    );
  });

  it("hovered crypto uses brand-text orange", () => {
    expect(rule(".bcc-copyright:hover .bcc-copyright-crypto {")).toContain(
      "color: var(--bcc-brand-text-orange);",
    );
  });

  it("hover produces four visually distinct states", () => {
    // resting secondary → year text, collar cyan, crypto orange: four
    // different colours, none equal to another.
    const resting = "var(--bcc-text-secondary)";
    const year = rule(".bcc-copyright:hover .bcc-copyright-year {");
    const collar = rule(".bcc-copyright:hover .bcc-copyright-collar {");
    const crypto = rule(".bcc-copyright:hover .bcc-copyright-crypto {");
    for (const r of [year, collar, crypto]) expect(r).not.toContain(resting);
    expect(year).not.toContain("brand-text");
    expect(collar).not.toContain("orange");
    expect(crypto).not.toContain("cyan");
  });

  it("typography and transitions are untouched", () => {
    const base = rule(".bcc-copyright {");
    expect(base).toContain("font-family: var(--font-mono), monospace;");
    expect(base).toContain("font-size: 11px;");
    expect(base).toContain("letter-spacing: 0.06em;");
    expect(NCSS).toContain(
      ".bcc-copyright-year,\n.bcc-copyright-collar,\n.bcc-copyright-crypto {\n  transition: color 150ms ease;\n}",
    );
    expect(rule(".bcc-copyright-lg {")).toContain("font-size: 13px;");
  });
});

// ── the tokens are text, nothing else ─────────────────────────────────

describe("brand-text tokens are readable text only", () => {
  const USES = [...NCSS.matchAll(/^.*var\(--bcc-brand-text-(?:cyan|orange)\).*$/gm)].map((m) =>
    m[0].trim(),
  );

  it("every use is a color: declaration", () => {
    expect(USES.length).toBeGreaterThan(0);
    // Anchored on a property boundary — a bare /color:/ also matches
    // `border-bottom-color:`, which is exactly what must NOT appear.
    for (const u of USES) expect(u).toMatch(/^color:\s*var\(--bcc-brand-text-(cyan|orange)\);$/);
  });

  it("never used for focus, borders, indicators, backgrounds or shadows", () => {
    for (const prop of ["outline", "border", "box-shadow", "background", "fill", "stroke"]) {
      expect(NCSS).not.toMatch(
        new RegExp(`${prop}[a-z-]*:[^;]*var\\(--bcc-brand-text-(cyan|orange)\\)`),
      );
    }
  });
});

// ── nothing else moved ────────────────────────────────────────────────

/**
 * E1e — the header wordmark, which E1d deferred.
 *
 * `.bcc-brand-top` / `-bottom` carried the same light-theme failure (2.39:1
 * and 2.42:1) on permanent 16px text across every page. The fix could not be
 * a bare token swap: the header is glass over independently scrolling
 * content, and on mobile (`.bcc-col-left` is `display:none` below 768px) the
 * centre column spans from x=0, so arbitrary imagery passes directly beneath
 * the wordmark. Measured with hostile backdrops forced under the header:
 * 2.67:1 over a dark image in light theme, 1.75:1 over a bright one in dark.
 *
 * An unbounded backdrop cannot be fixed by choosing a colour — the two themes
 * fail in opposite directions. An opaque plate behind the lockup makes it
 * deterministic instead, scoped to the header so the other four consumers are
 * untouched.
 *
 * The plate is `--bcc-header-plate`, the OPAQUE FORM OF THE HEADER TINT, not
 * `--bcc-bg`. In dark those coincide; in light they do not — the header
 * composites to rgb(249,250,251) while the page is rgb(255,255,255), and that
 * 6/5/4 channel delta reads as a white sticker behind the wordmark. Matching
 * the header instead costs a little contrast (the tint is darker than white),
 * which is why the light brand-text values were darkened to clear 4.7:1 on it.
 */
describe("E1e — the header wordmark uses the brand-text tokens", () => {
  it(".bcc-brand-top uses brand-text cyan", () => {
    expect(rule(".bcc-brand-top {")).toContain("color: var(--bcc-brand-text-cyan);");
    expect(rule(".bcc-brand-top {")).not.toContain("var(--bcc-primary)");
  });

  it(".bcc-brand-bottom uses brand-text orange", () => {
    expect(rule(".bcc-brand-bottom {")).toContain("color: var(--bcc-brand-text-orange);");
    expect(rule(".bcc-brand-bottom {")).not.toContain("var(--bcc-secondary)");
  });

  it("only the colour changed — typography is untouched", () => {
    for (const sel of [".bcc-brand-top {", ".bcc-brand-bottom {"]) {
      const r = rule(sel);
      expect(r).toContain("font-family: var(--font-stencil), Impact, sans-serif;");
      expect(r).toContain("font-weight: 900;");
      expect(r).toContain("font-size: 16px;");
      expect(r).toContain("letter-spacing: 0.14em;");
      expect(r).toContain("text-transform: uppercase;");
    }
  });

  it("16px/900 is below the large-text threshold, so 4.5:1 applies", () => {
    // 18.66px bold / 24px regular is the large-text bar. This is neither,
    // so the wordmark answers to 4.5:1 and not 3:1.
    expect(rule(".bcc-brand-top {")).toContain("font-size: 16px;");
  });
});

describe("E1e — the plate", () => {
  it("is defined once per theme scope as the opaque header tint", () => {
    const all = [...NCSS.matchAll(/--bcc-header-plate:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(all).toEqual(["#f8f9fa", "#0d1117", "#0d1117"]);
  });

  it("matches the rgb channels of --bcc-header-bg in every scope", () => {
    // This is the property that keeps it invisible. If someone retunes the
    // header tint without retuning the plate, the plate becomes a sticker.
    const tints = [...NCSS.matchAll(/--bcc-header-bg:\s*rgba\(([^)]+)\)/g)].map((m) =>
      (m[1] ?? "").split(",").slice(0, 3).map((n) => Number(n.trim())),
    );
    const plates = [...NCSS.matchAll(/--bcc-header-plate:\s*#([0-9a-f]{6})/gi)].map((m) =>
      [0, 2, 4].map((i) => parseInt((m[1] ?? "").slice(i, i + 2), 16)),
    );
    expect(plates).toHaveLength(tints.length);
    for (const [i, plate] of plates.entries()) expect(plate).toEqual(tints[i]);
  });

  it("is scoped to the header — the other four consumers get no plate", () => {
    expect(NCSS).toContain(".bcc-header .bcc-brand-wordmark {");
    // The shared wrapper rule must not itself gain a background.
    const shared = rule(".bcc-brand-wordmark {");
    expect(shared).not.toContain("background");
    expect(shared).not.toContain("padding");
    expect(shared).not.toContain("border-radius");
  });

  it("carries no border, shadow or blur — measurements did not justify them", () => {
    const r = rule(".bcc-header .bcc-brand-wordmark {");
    expect(r).toContain("background: var(--bcc-header-plate);");
    expect(r).toContain("padding: 2px 6px;");
    expect(r).toContain("border-radius: var(--bcc-radius-sm);");
    for (const prop of ["border:", "box-shadow", "backdrop-filter", "filter:", "opacity"]) {
      expect(r).not.toContain(prop);
    }
  });
});

describe("E1e — wordmark contrast on the plate", () => {
  const PLATE = { light: hex("#f8f9fa"), dark: hex("#0d1117") } as const;
  const HEADER_MIN = 4.7; // tighter than 4.5 so rounding cannot drop it below

  it(`light cyan clears ${HEADER_MIN}:1 on the plate`, () => {
    expect(ratio(hex(LIGHT.cyan), PLATE.light)).toBeGreaterThanOrEqual(HEADER_MIN);
  });

  it(`light orange clears ${HEADER_MIN}:1 on the plate`, () => {
    expect(ratio(hex(LIGHT.orange), PLATE.light)).toBeGreaterThanOrEqual(HEADER_MIN);
  });

  it("dark cyan and orange clear 4.5:1 on the plate", () => {
    expect(ratio(hex(DARK.cyan), PLATE.dark)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(hex(DARK.orange), PLATE.dark)).toBeGreaterThanOrEqual(4.5);
  });

  it("the plate is what makes this deterministic — raw tokens on glass would not pass", () => {
    // Header glass composited over a dark image in light theme. Documents
    // why the plate exists rather than a darker colour.
    // header tint #f8f9fa at 0.80 over a black image, alpha-composited
    const overDarkImage: RGB = [
      Math.round(0xf8 * 0.8),
      Math.round(0xf9 * 0.8),
      Math.round(0xfa * 0.8),
    ];
    expect(ratio(hex(LIGHT.cyan), overDarkImage)).toBeLessThan(4.5);
  });
});

describe("adjacent contracts are untouched", () => {
  it("accent tokens are unchanged", () => {
    const defs = [...NCSS.matchAll(/--bcc-accent:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(defs).toEqual(["var(--bcc-primary)", "var(--bcc-secondary)"]);
  });

  it("focus-ring and indicator tokens are unchanged", () => {
    expect([...NCSS.matchAll(/--bcc-focus-ring:\s*([^;]+);/g)].map((m) => m[1]?.trim())).toEqual([
      "#1081a3",
      "#b95e05",
    ]);
    expect(
      [...NCSS.matchAll(/--bcc-accent-indicator:\s*([^;]+);/g)].map((m) => m[1]?.trim()),
    ).toEqual(["#1081a3", "#b95e05"]);
  });

  it("the global focus rule is unchanged", () => {
    expect(NCSS).toContain(
      "  :focus-visible {\n    outline: 2px solid var(--bcc-focus-ring);\n    outline-offset: 2px;\n    border-radius: var(--bcc-radius-sm);\n  }",
    );
  });

  it("tab rules are unchanged", () => {
    expect(rule(".bcc-tab {")).toContain("border-bottom: 3px solid transparent;");
    expect(rule('.bcc-tab[aria-selected="true"],')).toContain(
      "border-bottom-color: var(--bcc-accent-indicator);",
    );
    expect(rule(".bcc-tab:focus-visible {")).toContain("outline-offset: -4px;");
  });
});

describe("all six copyright consumers are intact", () => {
  const CONSUMERS = [
    "src/app/(main)/(marketing)/layout.tsx",
    "src/components/errors/NotFoundContent.tsx",
    "src/components/layout/LeftSidebar.tsx",
    "src/components/layout/offcanvas/MainOffcanvas.tsx",
    "src/components/layout/shells/MinimalShell.tsx",
    "src/components/legal/LegalDoc.tsx",
  ];

  for (const path of CONSUMERS) {
    it(`${path.split("/").pop()} still renders <CopyrightMark`, () => {
      expect(readFileSync(resolve(process.cwd(), path), "utf-8")).toContain("<CopyrightMark");
    });
  }

  it("the component still emits all three spans", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/layout/CopyrightMark.tsx"),
      "utf-8",
    );
    for (const cls of ["bcc-copyright-year", "bcc-copyright-collar", "bcc-copyright-crypto"]) {
      expect(src).toContain(cls);
    }
  });
});
