/**
 * Tab states — `.bcc-tab` and `--bcc-accent-indicator`.
 *
 * Kept separate from `focus-indicator-token.test.ts` on purpose. That file
 * owns the GLOBAL keyboard-focus contract; this one owns the tab
 * component's state ladder. They interact at exactly one point — the
 * local `outline-offset` override — which is asserted in both directions
 * here.
 *
 * ## What this batch fixes
 *
 * Before it, `.bcc-tab` read: inactive `--bcc-text-muted` (2.28:1 dark /
 * 2.54:1 light), hover `--bcc-text-secondary`, selected `--bcc-accent`
 * (2.39:1 light). Two of the three failed AA, and the selected state
 * failed hardest in light — the one rung that most needs to read.
 *
 * ## Three findings that shaped it, all measured on a live consumer
 *
 * 1. **Row shift.** `.bcc-tab` has no explicit height, so the bottom
 *    border adds to it. Widening only the selected tab to 3px made that
 *    tab 47.797px against its siblings' 46.797px. The border is therefore
 *    3px on EVERY tab and only the *colour* changes on selection.
 *
 * 2. **Clipped focus ring.** The strip sets `overflow-x: auto`, which per
 *    spec forces `overflow-y` to `auto` — so it clips vertically too. A
 *    tab sits flush with the strip's top edge (0px headroom above, 1px
 *    below) while the global ring needs 4px. Measured: 4px cut off the
 *    top, 3px off the bottom, leaving two vertical fragments. Hence the
 *    local inset offset.
 *
 * 3. **A dead rule.** `.bcc-tab.active .bcc-tab-count` tinted the count
 *    accent at `opacity: 0.7`, but no consumer applies `.active` — all
 *    four use `aria-selected`. It never matched, so the count was already
 *    opaque secondary. Deleted rather than ported.
 *
 * ## Why the indicator may share the focus ring's hex
 *
 * Both must clear 3:1 against the same two tab-strip backgrounds
 * (`#ffffff` and `#0d1117`), which confines them to one narrow luminance
 * band: the most distinct compliant value is 1.28:1 from the ring, i.e.
 * indistinguishable. They stay separate *tokens* so they can diverge if a
 * surface changes, and separation is carried by geometry — a 3px flush
 * underline versus a 2px inset rounded rectangle with a 1px gap between
 * them.
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

/** Read a token's value from a specific scope block. */
function tokenIn(scope: string, name: string): string {
  const i = NCSS.indexOf(scope);
  if (i < 0) throw new Error(`scope ${scope} not found`);
  const block = NCSS.slice(i, NCSS.indexOf("\n}", i));
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(block);
  if (m?.[1] === undefined) throw new Error(`--${name} not found in ${scope}`);
  return m[1].trim();
}

/** The rule body for a selector, as authored. */
function rule(selector: string): string {
  const i = NCSS.indexOf(selector);
  if (i < 0) throw new Error(`selector ${selector} not found`);
  return NCSS.slice(i, NCSS.indexOf("}", i));
}

/**
 * Measured live on `/communities/holders-gelotto` (public GroupTabs): the
 * strip carries no background of its own, so it paints on the page.
 */
const TAB_BACKGROUNDS: ReadonlyArray<readonly [string, RGB]> = [
  ["tab strip (light) #ffffff", hex("#ffffff")],
  ["tab strip (dark) #0d1117", hex("#0d1117")],
];

const INDICATOR_MIN = 3.5; // 3:1 bar, 3.5 target margin
const TEXT_MIN = 4.5;

const SCOPES: ReadonlyArray<readonly [string, string]> = [
  ['[data-accent="primary"]', "#1081a3"],
  ['[data-accent="secondary"]', "#b95e05"],
];

// ── the indicator token ───────────────────────────────────────────────

describe("--bcc-accent-indicator exists per accent family", () => {
  it("is defined exactly twice, one per accent scope", () => {
    const all = [...NCSS.matchAll(/--bcc-accent-indicator:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(all).toEqual(["#1081a3", "#b95e05"]);
  });

  for (const [scope, value] of SCOPES) {
    it(`${scope} carries ${value}`, () => {
      expect(tokenIn(scope, "bcc-accent-indicator")).toBe(value);
    });
  }

  it("is not redefined in any theme scope", () => {
    for (const s of ['[data-theme="light"]', '[data-theme="dark"]']) {
      const i = NCSS.indexOf(s);
      if (i < 0) continue;
      expect(NCSS.slice(i, NCSS.indexOf("\n}", i))).not.toContain("--bcc-accent-indicator");
    }
  });
});

describe("--bcc-accent-indicator clears the indicator bar on real tab backgrounds", () => {
  for (const [scope, value] of SCOPES) {
    for (const [label, bg] of TAB_BACKGROUNDS) {
      it(`${scope} on ${label} >= ${INDICATOR_MIN}:1`, () => {
        expect(ratio(hex(value), bg)).toBeGreaterThanOrEqual(INDICATOR_MIN);
      });
    }
  }

  it("the old accent would not have passed — documents why the token exists", () => {
    expect(ratio(hex("#16b5e6"), hex("#ffffff"))).toBeLessThan(3.0);
    expect(ratio(hex("#f98a1c"), hex("#ffffff"))).toBeLessThan(3.0);
  });
});

describe("--bcc-accent-indicator is geometry, never readable text", () => {
  it("appears in no color: declaration", () => {
    // Anchored on a property boundary: a bare /color:/ also matches
    // `border-bottom-color:`, which is exactly where this token belongs.
    expect(NCSS).not.toMatch(/(^|[;{\s])color:\s*var\(--bcc-accent-indicator\)/m);
  });

  it("every use is a border-color declaration", () => {
    const uses = [...NCSS.matchAll(/^.*var\(--bcc-accent-indicator\).*$/gm)]
      .map((m) => m[0].trim())
      .filter((l) => !l.startsWith("--bcc-accent-indicator"));
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u).toMatch(/^border-bottom-color:/);
  });
});

// ── the state ladder ──────────────────────────────────────────────────

describe("the .bcc-tab state ladder", () => {
  it("inactive label is secondary", () => {
    expect(rule(".bcc-tab {")).toContain("color: var(--bcc-text-secondary);");
  });

  it("hover label is primary text", () => {
    expect(rule(".bcc-tab:hover {")).toContain("color: var(--bcc-text);");
  });

  it("selected label is primary text and the border takes the indicator", () => {
    const r = rule('.bcc-tab[aria-selected="true"],');
    expect(r).toContain("color: var(--bcc-text);");
    expect(r).toContain("border-bottom-color: var(--bcc-accent-indicator);");
  });

  it("selected keeps .active as a compatibility selector", () => {
    expect(NCSS).toContain('.bcc-tab[aria-selected="true"],\n  .bcc-tab.active {');
  });

  it("selected wins over hover — same specificity, declared later", () => {
    // Both are (0,2,0), so source order decides. If someone moves the
    // hover rule below the selected rule, hovering a selected tab would
    // silently drop it back to the inactive-hover colour.
    expect(NCSS.indexOf(".bcc-tab:hover {")).toBeLessThan(
      NCSS.indexOf('.bcc-tab[aria-selected="true"],'),
    );
  });

  it("every label rung clears 4.5:1 on both tab backgrounds", () => {
    const rungs: ReadonlyArray<readonly [string, string, string]> = [
      ["inactive", "#4b5563", "#8b949e"], // --bcc-text-secondary light/dark
      ["hover", "#111827", "#e6edf3"], // --bcc-text light/dark
      ["selected", "#111827", "#e6edf3"],
      ["count", "#4b5563", "#8b949e"],
    ];
    for (const [name, light, dark] of rungs) {
      expect(ratio(hex(light), hex("#ffffff")), `${name} light`).toBeGreaterThanOrEqual(TEXT_MIN);
      expect(ratio(hex(dark), hex("#0d1117")), `${name} dark`).toBeGreaterThanOrEqual(TEXT_MIN);
    }
  });
});

describe("the count is opaque secondary in every state", () => {
  it("declares secondary with no opacity", () => {
    const r = rule(".bcc-tab-count {");
    expect(r).toContain("color: var(--bcc-text-secondary);");
    expect(r).not.toContain("opacity");
  });

  it("no rule anywhere reduces the count's opacity", () => {
    // The dead `.bcc-tab.active .bcc-tab-count { opacity: 0.7 }` is gone.
    // A 0.7 composite would not have cleared 4.5:1.
    expect(NCSS).not.toMatch(/\.bcc-tab-count\s*\{[^}]*opacity/);
    expect(NCSS).not.toContain(".bcc-tab.active .bcc-tab-count");
  });
});

// ── geometry ──────────────────────────────────────────────────────────

describe("border geometry cannot shift the row", () => {
  it("the base rule sets a 3px border on every tab", () => {
    expect(rule(".bcc-tab {")).toContain("border-bottom: 3px solid transparent;");
  });

  it("the selected rule changes colour only, never width", () => {
    const r = rule('.bcc-tab[aria-selected="true"],');
    expect(r).toContain("border-bottom-color:");
    expect(r).not.toMatch(/border-bottom(-width)?:\s*\d/);
  });

  it("inactive and hover leave the border transparent", () => {
    expect(rule(".bcc-tab:hover {")).not.toContain("border-bottom");
    expect(rule(".bcc-tab {")).toContain("solid transparent");
  });
});

// ── focus: local offset only ──────────────────────────────────────────

describe("the local focus rule adjusts offset and nothing else", () => {
  const r = rule(".bcc-tab:focus-visible {");

  it("sets the measured inset offset", () => {
    expect(r).toContain("outline-offset: -4px;");
  });

  it("declares no colour, width, style or radius — those stay global", () => {
    expect(r).not.toContain("outline-color");
    expect(r).not.toContain("outline-width");
    expect(r).not.toContain("outline-style");
    expect(r).not.toMatch(/outline:\s/);
    expect(r).not.toContain("border-radius");
    // exactly one declaration
    expect(r.split(";").filter((s) => s.includes(":")).length).toBe(1);
  });

  it("does not reference either indicator or ring token directly", () => {
    expect(r).not.toContain("--bcc-focus-ring");
    expect(r).not.toContain("--bcc-accent-indicator");
  });
});

describe("the global focus rule is byte-identical", () => {
  it("still uses the ring token at +2px with the shared radius", () => {
    expect(NCSS).toContain(
      "  :focus-visible {\n    outline: 2px solid var(--bcc-focus-ring);\n    outline-offset: 2px;\n    border-radius: var(--bcc-radius-sm);\n  }",
    );
  });

  it("--bcc-focus-ring definitions are unchanged", () => {
    const all = [...NCSS.matchAll(/--bcc-focus-ring:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(all).toEqual(["#1081a3", "#b95e05"]);
  });
});

describe("focus and selected stay semantically separate", () => {
  it("they are distinct token names even where the hex matches", () => {
    for (const [scope, value] of SCOPES) {
      expect(tokenIn(scope, "bcc-focus-ring")).toBe(value);
      expect(tokenIn(scope, "bcc-accent-indicator")).toBe(value);
    }
    // Two declarations, not one aliasing the other — so either can move
    // without dragging the other with it.
    expect(NCSS).not.toContain("--bcc-accent-indicator: var(--bcc-focus-ring)");
    expect(NCSS).not.toContain("--bcc-focus-ring: var(--bcc-accent-indicator)");
  });

  it("the ring is an outline and the indicator is a border — never swapped", () => {
    expect(NCSS).toMatch(/outline:\s*2px solid var\(--bcc-focus-ring\)/);
    expect(NCSS).toMatch(/border-bottom-color:\s*var\(--bcc-accent-indicator\)/);
    expect(NCSS).not.toMatch(/outline[^;]*var\(--bcc-accent-indicator\)/);
    expect(NCSS).not.toMatch(/border[^;]*var\(--bcc-focus-ring\)/);
  });
});

// ── consumers and neighbours ──────────────────────────────────────────

describe("all four live consumers still use the shared class", () => {
  const CONSUMERS = [
    "src/components/entity/EntityTabs.tsx",
    "src/components/groups/GroupTabs.tsx",
    "src/components/profile/ProfileTabs.tsx",
    "src/components/watching/WatchingTabs.tsx",
  ];

  for (const path of CONSUMERS) {
    it(`${path.split("/").pop()} renders className="bcc-tab shrink-0"`, () => {
      const src = readFileSync(resolve(process.cwd(), path), "utf-8");
      expect(src).toContain('className="bcc-tab shrink-0"');
      // and still drives selection from aria-selected, which the CSS keys on
      expect(src).toContain("aria-selected=");
    });
  }

  it("no consumer applies the .active compatibility class", () => {
    for (const path of CONSUMERS) {
      const src = readFileSync(resolve(process.cwd(), path), "utf-8");
      expect(src).not.toMatch(/className="[^"]*\bbcc-tab\b[^"]*\bactive\b/);
    }
  });
});

describe("neighbouring contracts are untouched", () => {
  it("copyright is not touched by tab work", () => {
    // E1d moved the copyright ladder onto theme-scoped brand-text tokens;
    // its byte-identity pins now live in copyright-brand-contrast.test.ts.
    // What matters HERE is only that tab work never reaches it: the
    // copyright must not borrow the tab's indicator token.
    expect(NCSS).not.toMatch(/\.bcc-copyright[^{]*\{[^}]*--bcc-accent-indicator/);
    expect(NCSS).toContain(".bcc-copyright:hover .bcc-copyright-collar {\n  color: var(--bcc-brand-text-cyan);\n}");
  });

  it("SubTabNav is a lookalike this batch does not touch", () => {
    // It reimplements the ladder in TSX with border-safety. Divergent by
    // design here; converging it would mean editing TSX.
    const src = readFileSync(resolve(process.cwd(), "src/components/profile/panels/SetupPanel.tsx"), "utf-8");
    expect(src).toContain("border-safety text-bcc-text");
    // It references `.bcc-tab` in a comment explaining what it mirrors,
    // but must not actually apply the class — otherwise it would silently
    // inherit this batch's rules.
    expect(src).not.toMatch(/className=\{?\s*["'`][^"'`]*\bbcc-tab\b/);
  });

  it("--bcc-accent itself is unchanged", () => {
    const defs = [...NCSS.matchAll(/--bcc-accent:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(defs).toEqual(["var(--bcc-primary)", "var(--bcc-secondary)"]);
  });
});
