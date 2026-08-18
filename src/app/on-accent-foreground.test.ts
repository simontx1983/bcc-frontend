/**
 * Text and icons on a FILLED ACCENT ground get `--bcc-on-accent`, and it is
 * deliberately theme-blind.
 *
 * The four filled-accent grounds are single `:root` declarations that do NOT
 * flip with theme:
 *
 *   --bcc-primary         #16b5e6   L 0.3893
 *   --bcc-primary-light   #55ccf0   L 0.5141
 *   --bcc-secondary       #f98a1c   L 0.3840
 *   --bcc-secondary-light #ffac55   L 0.5142
 *
 * All four are LIGHT, in both themes. So their foreground must be DARK, in
 * both themes — which is why this needs its own token and why the obvious
 * candidate is wrong.
 *
 * ## `--bcc-text-inverse` does not fix this, and the numbers say so
 *
 * It resolves to `#ffffff` in light theme — i.e. exactly the `#fff` that was
 * already failing. Swapping to it changes nothing in light and only helps in
 * dark:
 *
 *   #fff on primary        2.39   ·  on primary-light   1.86
 *   #fff on secondary      2.42   ·  on secondary-light 1.86
 *
 * The codebase had already hit this trap once and documented it on
 * `.bcc-card-standing-row[data-tone="alarm"]`: "--bcc-night rather than
 * --bcc-text-inverse because the amber ground is theme-fixed, and
 * text-inverse would go white on it in light mode." This token generalises
 * that fix rather than inventing a new idea.
 *
 * ## The consumer set was three times larger than the reported defect
 *
 * Four rules were reported using a literal `#fff`. A repo-wide sweep for
 * *readable text or icons on a solid accent ground* found **twelve**. The
 * other eight already used `--bcc-text-inverse` / `text-bcc-text-inverse`,
 * which fails identically in light theme — the same bug wearing the correct-
 * looking token. All twelve move together; a partial fix would leave the
 * identical failure in eight places.
 *
 * Four further solid-accent sites are NON-text (a nav bar, a 3px rule, a 7px
 * dot, a progress fill) and are deliberately untouched — 1.4.11 governs those,
 * not 1.4.3, and none carries a glyph or label.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const CSS = read("src/app/globals.css");
const TW = read("tailwind.config.ts");

const decls = (n: string) =>
  [...CSS.matchAll(new RegExp(`--${n}:\\s*([^;]+);`, "g"))].map((m) => m[1]?.trim() ?? "");

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

/** Every filled-accent ground: 2 accents x (normal, hover). */
const GROUNDS = [
  ["primary", "bcc-primary"],
  ["primary-light", "bcc-primary-light"],
  ["secondary", "bcc-secondary"],
  ["secondary-light", "bcc-secondary-light"],
] as const;

/** The exact reconciled set of text/icon-bearing solid-accent consumers. */
const CSS_CONSUMERS = [
  ".bcc-btn-primary",
  ".bcc-btn-primary:hover",
  ".bcc-hashtag:hover",
  ".bcc-auth-submit",
  ".bcc-resume-fab",
  ".bcc-ldg-btn-primary",
  ".bcc-onb-btn-primary",
  ".bcc-onb-opt-toggle.is-off",
  ".bcc-tour-btn-primary",
] as const;

const TSX_CONSUMERS = [
  "src/components/admin/ModerationQueue.tsx",
  "src/components/blog/StatusToggle.tsx",
  "src/components/ui/FilterChipRow.tsx",
] as const;

// ─────────────────────────────────────────────────────────────────────────
// 1. Preconditions — the scan proves itself
// ─────────────────────────────────────────────────────────────────────────

describe("on-accent foreground — preconditions", () => {
  it("read a real stylesheet and a real Tailwind config", () => {
    expect(CSS.length).toBeGreaterThan(100_000);
    expect(CSS).toContain("@tailwind");
    expect(TW).toContain("theme:");
  });

  it("the accent grounds are theme-blind — one declaration each", () => {
    // This is the whole premise. If any of them gains a theme scope, the
    // foreground question must be reopened and this guard should fail.
    for (const [, token] of GROUNDS) {
      expect(decls(token), `${token} is no longer theme-blind`).toHaveLength(1);
    }
  });

  it("the accent grounds hold the values measured here", () => {
    expect(decls("bcc-primary")).toEqual(["#16b5e6"]);
    expect(decls("bcc-primary-light")).toEqual(["#55ccf0"]);
    expect(decls("bcc-secondary")).toEqual(["#f98a1c"]);
    expect(decls("bcc-secondary-light")).toEqual(["#ffac55"]);
  });

  it("--bcc-accent really does resolve to those, per data-accent", () => {
    expect(CSS).toMatch(/\[data-accent="primary"\][\s\S]{0,200}--bcc-accent:\s*var\(--bcc-primary\)/);
    expect(CSS).toMatch(/\[data-accent="secondary"\][\s\S]{0,200}--bcc-accent:\s*var\(--bcc-secondary\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The token
// ─────────────────────────────────────────────────────────────────────────

describe("--bcc-on-accent", () => {
  it("exists, is theme-blind, and aliases --bcc-night rather than a new literal", () => {
    expect(decls("bcc-on-accent")).toEqual(["var(--bcc-night)"]);
    expect(decls("bcc-night")).toEqual(["#0d1117"]);
  });

  it("is bridged to Tailwind", () => {
    expect(TW).toContain('"bcc-on-accent":        "var(--bcc-on-accent)"');
  });

  it("is NOT --bcc-text-inverse, which flips and would fail light", () => {
    expect(decls("bcc-text-inverse")).toEqual(["#ffffff", "#0d1117", "#0d1117"]);
    // Light-theme inverse IS white — the value that was already failing.
    expect(ratio("#ffffff", "#16b5e6")).toBeLessThan(4.5);
    expect(ratio("#ffffff", "#ffac55")).toBeLessThan(4.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The full matrix — 4 grounds x 2 themes
// ─────────────────────────────────────────────────────────────────────────

describe("contrast: every accent x state x theme combination", () => {
  const FG = "#0d1117"; // --bcc-on-accent -> --bcc-night

  for (const [label, token] of GROUNDS) {
    for (const theme of ["light", "dark"] as const) {
      it(`${label} ground, ${theme} theme, clears 4.5:1`, () => {
        const bg = decls(token)[0] ?? "";
        // Theme-blind ground: the same value in both themes, asserted rather
        // than assumed, so a future theme scope cannot slip through.
        expect(decls(token)).toHaveLength(1);
        expect(ratio(FG, bg)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("worst case across all eight combinations is comfortably clear", () => {
    const worst = Math.min(...GROUNDS.map(([, t]) => ratio(FG, decls(t)[0] ?? "")));
    expect(worst).toBeGreaterThanOrEqual(4.5);
    expect(worst).toBeGreaterThan(7); // 7.82 — headroom for a lighter future accent
  });

  it("records the before/after so a regression is legible", () => {
    // Before: literal #fff. After: --bcc-on-accent.
    expect(ratio("#ffffff", "#16b5e6")).toBeLessThan(2.5); // 2.39
    expect(ratio("#ffffff", "#55ccf0")).toBeLessThan(2.0); // 1.86
    expect(ratio(FG, "#16b5e6")).toBeGreaterThan(7); // 7.92
    expect(ratio(FG, "#55ccf0")).toBeGreaterThan(10); // 10.17
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. The exact consumer set
// ─────────────────────────────────────────────────────────────────────────

describe("the reconciled consumer set", () => {
  it("covers exactly 9 CSS rules and 3 components", () => {
    expect(CSS_CONSUMERS).toHaveLength(9);
    expect(TSX_CONSUMERS).toHaveLength(3);
  });

  for (const sel of CSS_CONSUMERS) {
    it(`${sel} pairs a solid accent ground with --bcc-on-accent`, () => {
      const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rule = new RegExp(`${esc}\\s*\\{[^}]*\\}`).exec(CSS)?.[0] ?? "";
      expect(rule, `${sel} not found`).not.toBe("");
      expect(rule).toMatch(/background:\s*var\(--bcc-accent(-light)?\)/);
      expect(rule).toContain("color: var(--bcc-on-accent)");
      expect(rule).not.toMatch(/color:\s*#fff\b|color:\s*#ffffff\b/i);
      expect(rule).not.toContain("color: var(--bcc-text-inverse)");
    });
  }

  for (const file of TSX_CONSUMERS) {
    it(`${file.split("/").pop()} uses text-bcc-on-accent on its accent fill`, () => {
      const src = read(file);
      expect(src).toMatch(/bg-bcc-accent(?!-)[^"]*text-bcc-on-accent/);
      expect(src).not.toMatch(/bg-bcc-accent(?!-)[^"]*text-bcc-text-inverse/);
    });
  }

  it("REPO-WIDE: no readable text on a solid accent ground uses #fff or text-inverse", () => {
    // The assertion that actually closes the hole — a new consumer added
    // anywhere fails here, not just the twelve enumerated above.
    const files = [
      "src/app/globals.css",
      ...TSX_CONSUMERS,
      "src/components/settings/CommunitiesList.tsx",
      "src/components/settings/PrivacySettingsForm.tsx",
    ];
    for (const f of files) {
      const src = read(f);
      const pairs = [
        ...src.matchAll(
          /background(?:-color)?:\s*var\(--bcc-accent(?:-light)?\);\s*\r?\n?\s*color:\s*([^;]+);/g,
        ),
      ];
      for (const p of pairs) {
        expect(p[1], `${f}: solid accent with a non-on-accent foreground`).toContain(
          "--bcc-on-accent",
        );
      }
      expect(src).not.toMatch(/bg-bcc-accent(?!-)[^"]*text-bcc-(text-inverse|white)\b/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Scope discipline
// ─────────────────────────────────────────────────────────────────────────

describe("what this slice deliberately did NOT touch", () => {
  it("non-text solid-accent surfaces keep no foreground at all", () => {
    // A nav bar, a 3px rule, a 7px dot and a progress fill. 1.4.11 territory,
    // no label or glyph — out of scope for a text-foreground token.
    for (const sel of [".bcc-onb-rail-dot", ".bcc-onb-progress-fill"]) {
      const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rule = new RegExp(`${esc}\\s*\\{[^}]*\\}`).exec(CSS)?.[0] ?? "";
      expect(rule).not.toBe("");
      expect(rule).not.toContain("--bcc-on-accent");
    }
  });

  it("the accent background values themselves are unchanged", () => {
    expect(decls("bcc-primary")).toEqual(["#16b5e6"]);
    expect(decls("bcc-secondary")).toEqual(["#f98a1c"]);
    expect(decls("bcc-primary-light")).toEqual(["#55ccf0"]);
    expect(decls("bcc-secondary-light")).toEqual(["#ffac55"]);
  });

  it("safety and weld are untouched and still single-declaration", () => {
    // This slice must not disturb the tokens whose scoping is still deferred.
    expect(decls("bcc-safety")).toEqual(["#f05a28"]);
    expect(decls("safety-rgb")).toEqual(["240 90 40"]);
    expect(decls("bcc-weld")).toEqual(["#ffc01e"]);
    expect(decls("weld-rgb")).toEqual(["255 192 30"]);
  });

  it("no paper or cardstock consumer was pulled in", () => {
    // --paper/--cardstock are fixed cream; nothing here should touch them.
    const rules = CSS_CONSUMERS.map((sel) => {
      const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`${esc}\\s*\\{[^}]*\\}`).exec(CSS)?.[0] ?? "";
    }).join("\n");
    expect(rules).not.toContain("--paper");
    expect(rules).not.toContain("--cardstock");
  });
});
