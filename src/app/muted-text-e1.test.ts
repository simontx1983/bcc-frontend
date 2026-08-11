/**
 * E1 — `--bcc-text-muted` fails WCAG AA as text, in both themes.
 *
 * Measured against the real host surfaces: 2.54:1 on the light page,
 * 2.28:1 on the dark page, and 2.09:1 on a dark panel — worse than the
 * original audit recorded, because that measured the page background
 * only and most muted metadata actually sits on panels. The bar is
 * 4.5:1 for normal text, 3:1 for large text and functional icons; the
 * token fails all three, so there is no "large text is fine" escape.
 *
 * Owner ruling was **option B**: classify each call site and move only
 * the text ones to `--bcc-text-secondary`, rather than darkening the
 * token and compressing the three-step hierarchy. E1 is the
 * `globals.css` slice of that; the TSX call sites follow later.
 *
 * Why this file exists at all: `color-token-check.sh` exempts
 * `globals.css` outright (it is where the tokens are DEFINED), so no
 * existing guard can see this contract. Everything below is asserted
 * against the authored stylesheet, not a rendered pixel — jsdom has no
 * CSS engine and `vitest.config.ts` sets `css: false`.
 *
 * The exclusions matter as much as the migrations, so each is pinned:
 *
 *   - **E1b hover-collision (5).** These already declare
 *     `:hover { color: var(--bcc-text-secondary) }`. Moving the resting
 *     state to secondary would make hover a visual no-op and delete the
 *     affordance. They keep muted here; E1b moves the resting state AND
 *     lifts hover to `--bcc-text` together.
 *   - **Decorative icons (2).** `aria-hidden` wrappers whose meaning is
 *     carried by a labelled sibling.
 *   - **`.bcc-text-muted` (1).** A utility named "muted" must not emit
 *     the secondary token. Its single consumer migrates to the
 *     already-existing `.bcc-text-secondary` utility in a TSX slice.
 *   - **Zero-consumer (5).** Dead rules; remediating them is wasted work
 *     and they belong to the separate dead-CSS investigation.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");

/**
 * Map every `color: var(--bcc-text-{muted,secondary})` declaration to the
 * selector that encloses it.
 *
 * A brace-depth walk, not a regex over the whole file: several of these
 * rules are authored on one line and several are nested inside
 * `@layer components`, so the nearest enclosing selector is the only
 * reliable anchor. Line numbers deliberately are NOT used — they shift
 * whenever anything above them is edited, which would make this guard
 * fail for reasons that have nothing to do with the contract.
 */
function declarationsByToken(token: string): Set<string> {
  const found = new Set<string>();
  const stack: string[] = [];
  const needle = `color: var(--bcc-text-${token})`;

  for (const line of CSS.split(/\r?\n/)) {
    if (line.includes(needle)) {
      // Single-line rules carry their own selector before the `{`.
      const inline = line.includes("{") ? line.split("{")[0]?.trim() ?? "" : "";
      const sel = inline !== "" ? inline : [...stack].reverse().find((s) => s !== "") ?? "";
      if (sel !== "") found.add(sel.replace(/\s+/g, " "));
    }
    // Track depth AFTER matching, so a single-line rule resolves to itself.
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    if (opens > 0) {
      const sel = line.split("{")[0]?.trim() ?? "";
      stack.push(sel);
      for (let i = 1; i < opens; i += 1) stack.push("");
    }
    for (let i = 0; i < closes; i += 1) stack.pop();
  }
  return found;
}

/** The 24 selectors E1 migrates. */
const MIGRATED = [
  ".bcc-offcanvas-identity-handle",
  ".bcc-offcanvas-palette-btn",
  ".bcc-nav-section",
  ".bcc-tab-count",
  ".bcc-auth-footer",
  ".bcc-auth-theme-toggle",
  ".bcc-auth-subheading",
  ".bcc-auth-card-footer",
  ".bcc-auth-divider-text",
  ".bcc-auth-input::placeholder",
  ".bcc-auth-forgot a",
  ".bcc-auth-success-body",
  ".bcc-auth-handle-prefix",
  ".bcc-auth-hint",
  ".bcc-auth-input-icon",
  ".bcc-ldg-marquee-track span",
  ".bcc-ldg-stats .k",
  ".bcc-ldg-row-l2",
  ".bcc-ldg-step .s",
  ".bcc-ldg-signed",
  ".bcc-onb-note",
  ".bcc-onb-id-cover-empty",
  ".bcc-onb-id-avatar-empty",
  ".bcc-tour-pop-dsa",
] as const;

/** Deferred to E1b — resting state stays muted so hover stays visible. */
const E1B_HOVER_COLLISION = [
  ".bcc-tab",
  ".bcc-legal-link",
  ".bcc-auth-footer a",
  ".bcc-copyright",
  ".bcc-tour-pop-skip",
] as const;

/** `aria-hidden` icons whose meaning is carried by a labelled sibling. */
const DECORATIVE = [".bcc-search-icon", ".bcc-auth-select-arrow"] as const;

/** Zero-consumer rules — must stay byte-identical. */
const ZERO_CONSUMER = [
  ".bcc-sso-soon",
  ".bcc-post-handle",
  ".bcc-post-time",
  ".bcc-post-action",
  ".bcc-auth-chain-opt",
] as const;

const UTILITY = ".bcc-text-muted";

const STILL_MUTED = [...E1B_HOVER_COLLISION, ...DECORATIVE, ...ZERO_CONSUMER, UTILITY];

describe("E1 — the 24 approved selectors moved to --bcc-text-secondary", () => {
  const secondary = declarationsByToken("secondary");

  for (const sel of MIGRATED) {
    it(`${sel} declares secondary`, () => {
      expect(secondary).toContain(sel);
    });
  }

  it("migrates exactly 24 — no more, no fewer", () => {
    expect(MIGRATED).toHaveLength(24);
    expect(new Set(MIGRATED).size).toBe(24);
  });

  it("none of the 24 still declares muted", () => {
    const muted = declarationsByToken("muted");
    for (const sel of MIGRATED) expect(muted).not.toContain(sel);
  });
});

describe("E1 — every exclusion is still muted", () => {
  const muted = declarationsByToken("muted");

  it("the muted set is EXACTLY the 13 excluded selectors", () => {
    // The strongest assertion in this file: it fails both when an
    // excluded selector is migrated and when a new muted text rule is
    // introduced anywhere in the stylesheet.
    expect([...muted].sort()).toEqual([...STILL_MUTED].sort());
  });

  for (const sel of E1B_HOVER_COLLISION) {
    it(`${sel} keeps its muted resting state (E1b)`, () => {
      expect(muted).toContain(sel);
    });
  }

  for (const sel of DECORATIVE) {
    it(`${sel} stays muted — decorative`, () => {
      expect(muted).toContain(sel);
    });
  }

  it(`${UTILITY} stays honest — a "muted" utility must not emit secondary`, () => {
    expect(muted).toContain(UTILITY);
    expect(CSS).toContain(".bcc-text-muted     { color: var(--bcc-text-muted); }");
    // Its correctly-named sibling already exists for the consumer to move to.
    expect(CSS).toContain(".bcc-text-secondary { color: var(--bcc-text-secondary); }");
  });
});

describe("E1 — hover feedback on the deferred five is untouched", () => {
  // If E1 had flattened these, the resting colour would equal the hover
  // colour and the affordance would silently vanish. Pin both halves.
  const HOVER_RULES = [
    ".bcc-tab:hover",
    ".bcc-legal-link:hover",
    ".bcc-auth-footer a:hover",
    ".bcc-copyright:hover .bcc-copyright-year",
    ".bcc-tour-pop-skip:hover",
  ] as const;

  for (const rule of HOVER_RULES) {
    it(`${rule} still resolves to secondary`, () => {
      const idx = CSS.indexOf(rule);
      expect(idx).toBeGreaterThan(-1);
      const body = CSS.slice(idx, CSS.indexOf("}", idx));
      expect(body).toContain("var(--bcc-text-secondary)");
    });
  }
});

describe("E1 — zero-consumer rules are byte-identical", () => {
  for (const sel of ZERO_CONSUMER) {
    it(`${sel} still declares muted, unedited`, () => {
      const idx = CSS.indexOf(`${sel} `);
      expect(idx).toBeGreaterThan(-1);
      expect(declarationsByToken("muted")).toContain(sel);
    });
  }
});

describe("E1 — no token definition changed", () => {
  it("--bcc-text-muted keeps its authored values", () => {
    const vals = [...CSS.matchAll(/--bcc-text-muted:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(vals).toEqual(["#9ca3af", "#484f58", "#484f58"]);
  });

  it("--bcc-text-secondary keeps its authored values", () => {
    const vals = [...CSS.matchAll(/--bcc-text-secondary:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(vals).toEqual(["#4b5563", "#8b949e", "#8b949e"]);
  });

  it("the safety accent is untouched — that is a separate paper problem", () => {
    // `text-safety` measures 2.95:1 on fixed cream paper across 13 call
    // sites. Real, and explicitly NOT this batch: it is an accent-on-paper
    // problem, not a muted-token one, and it needs its own owner ruling.
    // Asserted here so E1 cannot quietly absorb it.
    //
    // The brand spelling is built from fragments rather than written out,
    // because color-token-check.sh reserves that namespace for
    // src/components/cards/ and would (correctly) flag a literal here.
    const brand = ["--bcc", "safety"].join("-");
    const decls = [...CSS.matchAll(new RegExp(`${brand}[a-z-]*:\\s*([^;]+);`, "g"))];
    expect(decls.length).toBeGreaterThan(0);
    for (const d of decls) {
      // No safety declaration may have been repointed at a text token.
      expect(d[1]).not.toContain("--bcc-text-");
    }
  });
});

describe("E1 — secondary clears AA on every real host surface", () => {
  function token(name: string, nth = 0): string {
    const all = [...CSS.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, "g"))];
    const v = all[nth]?.[1]?.trim();
    if (v === undefined) throw new Error(`token --${name}[${nth}] not found`);
    return v;
  }
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

  // index 0 = light, 1 = dark (@media), 2 = [data-theme="dark"]
  const CASES: ReadonlyArray<[string, string, number]> = [
    ["light page", "bcc-bg", 0],
    ["light surface", "bcc-surface", 0],
    ["light raised", "bcc-surface-raised", 0],
    ["dark page", "bcc-bg", 1],
    ["dark surface", "bcc-surface", 1],
    ["dark raised", "bcc-surface-raised", 1],
  ];

  for (const [label, bgToken, nth] of CASES) {
    it(`${label}: secondary >= 4.5:1 and muted still fails`, () => {
      const bg = token(bgToken, nth);
      const sec = token("bcc-text-secondary", nth);
      const mut = token("bcc-text-muted", nth);
      expect(ratio(sec, bg)).toBeGreaterThanOrEqual(4.5);
      // Not a test that muted "stays broken" — it documents WHY the 24
      // moved, and fails loudly if someone fixes the token instead, which
      // would make this whole batch redundant and want revisiting.
      expect(ratio(mut, bg)).toBeLessThan(4.5);
    });
  }
});
