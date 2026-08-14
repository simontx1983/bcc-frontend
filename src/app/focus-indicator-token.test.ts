/**
 * Keyboard focus indicator — `--bcc-focus-ring`.
 *
 * Deliberately a separate file from `muted-text-e1.test.ts`. Muted text
 * and keyboard focus are different accessibility contracts with
 * different bars (4.5:1 for readable text, 3:1 for a non-text
 * indicator), and folding them together would make both harder to read.
 *
 * ## Why the token exists
 *
 * The global ring used `--bcc-accent`, which is scoped by `data-accent`
 * only and **never by theme** — so the identical hex painted on a white
 * page and a near-black one. Measured ~2.39:1 (cyan) / ~2.42:1 (orange)
 * in light against the 3:1 bar for a functional indicator.
 *
 * ## Why these values, and why not theme-scoped
 *
 * The ring paints at `outline-offset: 2px`, i.e. OUTSIDE the control, so
 * it renders against the *surrounding* surface — never the control's own
 * fill. That set includes `--paper` / `--cardstock`, which stay fixed
 * cream in BOTH themes. A theme-scoped token therefore cannot work: the
 * bright dark-theme accent still lands at 1.91:1 on cardstock. One fixed
 * mid-tone per accent family clears every deterministic surface instead.
 *
 * ## Scope
 *
 * This slice changes the GLOBAL ring only. It does not touch the four
 * CSS input families that suppress the outline in a later cascade layer,
 * nor the 43 Tailwind `focus:outline-none` sites. Those remain open and
 * are asserted here to be byte-identical, so this file also serves as a
 * tripwire against silently "fixing" them without their own review.
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
  const [r, g, b] = [lin(c[0] / 255), lin(c[1] / 255), lin(c[2] / 255)];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a: RGB, b: RGB): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Composite a translucent layer over an opaque one. */
function over(fg: RGB, alpha: number, bg: RGB): RGB {
  return [0, 1, 2].map((i) => Math.round((fg[i] ?? 0) * alpha + (bg[i] ?? 0) * (1 - alpha))) as
    unknown as RGB;
}

const WHITE = hex("#ffffff");
const NIGHT = hex("#0d1117");

/**
 * Every surface the ring can actually paint against.
 *
 * Measured against the SURROUNDING surface, not the control fill —
 * `outline-offset: 2px` puts the ring outside the box. That is why
 * accent-filled buttons and safety controls are absent: their own fill
 * is never the ring's backdrop.
 *
 * The dialog scrim is also absent, and deliberately: `Dialog.tsx` renders
 * the backdrop with exactly one child, the panel, which is
 * `tabIndex={-1}` and `outline-none`. Nothing focusable paints a ring on
 * the scrim, and including it would over-constrain the token.
 */
const BACKGROUNDS: ReadonlyArray<readonly [string, RGB]> = [
  ["page / panel / sidebar (light)", WHITE],
  ["surface-raised (light)", hex("#f9f9f9")],
  ["glass composited (light)", over(WHITE, 0.62, WHITE)],
  ["glass-solid composited (light)", over(WHITE, 0.82, WHITE)],
  ["page (dark)", NIGHT],
  ["panel / sidebar (dark)", hex("#161b22")],
  ["surface-raised (dark)", hex("#1c2128")],
  ["glass composited (dark)", over(hex("#161b22"), 0.62, NIGHT)],
  ["glass-solid composited (dark)", over(hex("#161b22"), 0.82, NIGHT)],
  ["paper — fixed cream, both themes", hex("#f7efd9")],
  ["cardstock — fixed cream, both themes", hex("#efe5cf")],
];

/** Indicator bar is 3:1; the owner set a 3.5 safety margin. */
const MIN_RATIO = 3.5;

const RINGS: ReadonlyArray<readonly [string, string]> = [
  ['[data-accent="primary"]', "#1081a3"],
  ['[data-accent="secondary"]', "#b95e05"],
];

// ── token definition ──────────────────────────────────────────────────

describe("--bcc-focus-ring is defined once per accent family", () => {
  it("exists exactly twice — one per accent scope, no stragglers", () => {
    const all = [...NCSS.matchAll(/--bcc-focus-ring:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(all).toEqual(["#1081a3", "#b95e05"]);
  });

  it("primary scope carries the cyan value", () => {
    const i = NCSS.indexOf('[data-accent="primary"] {');
    const block = NCSS.slice(i, NCSS.indexOf("}", i));
    expect(block).toContain("--bcc-focus-ring:      #1081a3;");
  });

  it("secondary scope carries the orange value", () => {
    const i = NCSS.indexOf('[data-accent="secondary"] {');
    const block = NCSS.slice(i, NCSS.indexOf("}", i));
    expect(block).toContain("--bcc-focus-ring:      #b95e05;");
  });

  it("is not redefined in any theme scope — it is accent-aware, not theme-aware", () => {
    for (const scope of ['[data-theme="light"]', '[data-theme="dark"]', "@media (prefers-color-scheme: dark)"]) {
      const i = NCSS.indexOf(scope);
      if (i < 0) continue;
      const block = NCSS.slice(i, NCSS.indexOf("\n}", i));
      expect(block).not.toContain("--bcc-focus-ring");
    }
  });
});

// ── contrast ──────────────────────────────────────────────────────────

describe("--bcc-focus-ring clears the indicator bar with margin", () => {
  for (const [scope, value] of RINGS) {
    for (const [label, bg] of BACKGROUNDS) {
      it(`${scope} on ${label} >= ${MIN_RATIO}:1`, () => {
        expect(ratio(hex(value), bg)).toBeGreaterThanOrEqual(MIN_RATIO);
      });
    }

    it(`${scope} worst case is recorded and above 3:1`, () => {
      const worst = Math.min(...BACKGROUNDS.map(([, bg]) => ratio(hex(value), bg)));
      expect(worst).toBeGreaterThan(3.0);
      expect(worst).toBeGreaterThanOrEqual(MIN_RATIO);
    });
  }

  it("the old accent would NOT have passed — documents why the token exists", () => {
    // Not a test that accent "stays broken": it pins the premise. If
    // accent is ever made theme-aware and passes, this slice wants
    // revisiting rather than silently keeping a redundant token.
    const worstCyan = Math.min(...BACKGROUNDS.map(([, bg]) => ratio(hex("#16b5e6"), bg)));
    expect(worstCyan).toBeLessThan(3.0);
  });
});

// ── the global rule ───────────────────────────────────────────────────

describe("the global :focus-visible rule", () => {
  const i = NCSS.indexOf(":focus-visible {");
  const rule = NCSS.slice(i, NCSS.indexOf("}", i));

  it("uses the focus-ring token", () => {
    expect(rule).toContain("outline: 2px solid var(--bcc-focus-ring)");
  });

  it("no longer uses --bcc-accent", () => {
    expect(rule).not.toContain("var(--bcc-accent)");
  });

  it("keeps 2px width, 2px offset and the same radius", () => {
    expect(rule).toContain("outline: 2px solid");
    expect(rule).toContain("outline-offset: 2px;");
    expect(rule).toContain("border-radius: var(--bcc-radius-sm);");
  });
});

// ── the token is chrome, never text ───────────────────────────────────

describe("--bcc-focus-ring is never used as readable text", () => {
  it("appears in no color: declaration", () => {
    // It is tuned to 3:1, not 4.5:1 — using it for glyphs would ship
    // text that looks deliberate and fails.
    expect(NCSS).not.toMatch(/color:\s*var\(--bcc-focus-ring\)/);
  });

  it("appears only in outline declarations and its own definitions", () => {
    const uses = [...NCSS.matchAll(/^.*var\(--bcc-focus-ring\).*$/gm)].map((m) => m[0].trim());
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/^outline:/);
  });
});

// ── nothing else moved ────────────────────────────────────────────────

describe("adjacent tokens and rules are untouched", () => {
  it("--bcc-accent still resolves to the brand families", () => {
    const defs = [...NCSS.matchAll(/--bcc-accent:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(defs).toEqual(["var(--bcc-primary)", "var(--bcc-secondary)"]);
  });

  it("--bcc-accent-indicator is a SEPARATE token, not an alias of the ring", () => {
    // E1c introduced it for selected-tab geometry. The two currently hold
    // the same hex — unavoidable, since both must clear 3:1 against the
    // same backgrounds — but neither may be defined in terms of the
    // other, so either can move independently later.
    expect(NCSS).not.toContain("--bcc-accent-indicator: var(--bcc-focus-ring)");
    expect(NCSS).not.toContain("--bcc-focus-ring: var(--bcc-accent-indicator)");
    // The ring must never be used for selected-state geometry, or the two
    // signals collapse back into one.
    expect(NCSS).not.toMatch(/border[^;]*var\(--bcc-focus-ring\)/);
  });

  it("brand values are unchanged", () => {
    expect(NCSS).toContain("--bcc-primary:         #16b5e6;");
    expect(NCSS).toContain("--bcc-secondary:       #f98a1c;");
  });
});

describe("component focus overrides remain byte-identical", () => {
  // Each of these has its own reason to exist and its own review. The
  // global slice must not have touched any of them.
  const PINNED: ReadonlyArray<readonly [string, string]> = [
    ["card-body-link inset ring", ".bcc-card-body-link:focus-visible {\n    outline: 2px solid var(--bcc-accent);\n    outline-offset: -3px;\n  }"],
    ["card-flip-chip", ".bcc-card-flip-chip:focus-visible {\n    border-color: var(--bcc-accent);\n    color: var(--bcc-accent);\n  }"],
  ];

  for (const [label, rule] of PINNED) {
    it(`${label} unchanged`, () => {
      expect(NCSS).toContain(rule);
    });
  }

  /**
   * These two were pinned here as "(0 consumers)" — annotated dead even
   * then. The dead-CSS cleanup deleted them, so the pin inverts to an
   * absence check. The focus contract for live components above is
   * untouched.
   */
  for (const sel of [".bcc-nav-link", ".bcc-footer-col-link"]) {
    it(`${sel} was deleted as dead CSS — its focus rule is absent`, () => {
      const token = new RegExp(`(?<![-\\w])${sel.replace(".", "\\.")}(?![-\\w])`);
      expect(token.test(NCSS), `${sel} came back`).toBe(false);
    });
  }
});

describe("the surviving input families still suppress the ring — unresolved, not regressed", () => {
  // These carry `outline: none` on their BASE rule in a later cascade
  // layer (`.bcc-auth-input` is unlayered entirely), which beats the
  // @layer base global ring. Their replacement is a 2.39:1 border plus a
  // `rgba(..., 0.08)` glow — effectively invisible.
  //
  // This slice deliberately does NOT fix them: each needs its own
  // decision about what an accessible input focus state looks like.
  // Pinned so a later edit cannot quietly change them here.
  //
  // Two of the original four — `.bcc-composer-input` and `.bcc-input` —
  // had zero consumers and were removed by the dead-CSS cleanup. The
  // defect they represented did not shrink: it never applied to anything
  // rendered. The two that DO render are still pinned, unchanged.
  for (const cls of [".bcc-search-input", ".bcc-auth-input"]) {
    it(`${cls}:focus still uses the subtle glow`, () => {
      const i = NCSS.indexOf(`${cls}:focus`);
      expect(i).toBeGreaterThan(-1);
      const rule = NCSS.slice(i, NCSS.indexOf("}", i));
      expect(rule).toContain("box-shadow: 0 0 0 3px var(--bcc-accent-subtle)");
    });
  }

  for (const cls of [".bcc-composer-input", ".bcc-input"]) {
    it(`${cls} was deleted as dead CSS — absent, not silently fixed`, () => {
      const token = new RegExp(`(?<![-\\w])${cls.replace(".", "\\.")}(?![-\\w])`);
      expect(token.test(NCSS), `${cls} came back`).toBe(false);
    });
  }

  it("the subtle token is still an 8% tint — the reason those inputs fail", () => {
    expect(NCSS).toContain("--bcc-primary-subtle:  rgba(22, 181, 230, 0.08);");
  });
});
