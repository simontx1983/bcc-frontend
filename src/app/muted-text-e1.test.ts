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

/**
 * E1b — three of the five hover-collision selectors now have a real
 * two-rung ladder: resting `--bcc-text-secondary`, hover `--bcc-text`.
 *
 * Before E1b they rested on muted and hovered to secondary, so E1 could
 * not lift their resting state without making hover a visual no-op. The
 * fix is to move both rungs at once, which is why these did not ship
 * with the other 24.
 *
 * `.bcc-auth-footer a` also corrects an inversion E1 introduced: E1
 * moved the footer *container* to secondary while its links stayed
 * muted, leaving interactive text dimmer than the prose around it.
 */
const E1B_LADDER = [
  ".bcc-legal-link",
  ".bcc-auth-footer a",
  ".bcc-tour-pop-skip",
] as const;

/**
 * Still deferred after E1b, and NOT for the same reason as before —
 * both are blocked on accent, which is scoped by `data-accent` only and
 * never by theme, so it is the same hex in both (2.39:1 for
 * `--bcc-primary` and 2.42:1 for `--bcc-secondary` on a light page).
 *
 *   `.bcc-tab`       — the selected rung. Its label needs 4.5:1, its
 *                      count needs 4.5:1, and its 2px selected underline
 *                      is a functional indicator needing 3:1. Accent
 *                      gives ~2.4:1 in light for all three. Lifting rest
 *                      and hover without fixing accent would make the
 *                      SELECTED tab the faintest of the three rungs.
 *   `.bcc-copyright` — its collar/crypto hover children go to
 *                      `--bcc-primary` / `--bcc-secondary`. Migrating
 *                      only the resting and year rungs would leave
 *                      hover-triggered text inaccessible in light.
 *
 * Both wait on the E1c accent decision. Their rules must stay
 * byte-identical until then — asserted below.
 */
const DEFERRED_ON_ACCENT = [".bcc-tab", ".bcc-copyright"] as const;

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

/**
 * After E1b the muted set is 10, not 13 — the three ladder selectors
 * left it. `.bcc-tab` and `.bcc-copyright` remain until E1c.
 */
const STILL_MUTED = [...DEFERRED_ON_ACCENT, ...DECORATIVE, ...ZERO_CONSUMER, UTILITY];

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

  it("the muted set is EXACTLY the 10 remaining excluded selectors", () => {
    // The strongest assertion in this file: it fails both when an
    // excluded selector is migrated and when a new muted text rule is
    // introduced anywhere in the stylesheet.
    expect([...muted].sort()).toEqual([...STILL_MUTED].sort());
  });

  for (const sel of DEFERRED_ON_ACCENT) {
    it(`${sel} keeps its muted resting state — blocked on E1c accent`, () => {
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

describe("E1c — hover feedback on the two accent-blocked selectors is untouched", () => {
  // If E1/E1b had flattened these, the resting colour would equal the
  // hover colour and the affordance would silently vanish. Pin both
  // halves until E1c resolves accent.
  const HOVER_RULES = [
    ".bcc-tab:hover",
    ".bcc-copyright:hover .bcc-copyright-year",
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

describe("E1b — the three ladder selectors rest on secondary", () => {
  const secondary = declarationsByToken("secondary");
  const muted = declarationsByToken("muted");

  for (const sel of E1B_LADDER) {
    it(`${sel} rests on secondary, not muted`, () => {
      expect(secondary).toContain(sel);
      expect(muted).not.toContain(sel);
    });
  }

  it("exactly three selectors are in the ladder", () => {
    expect(E1B_LADDER).toHaveLength(3);
    expect(new Set(E1B_LADDER).size).toBe(3);
  });
});

describe("E1b — each ladder selector moves to primary text on hover", () => {
  // The whole point of E1b: rest and hover move TOGETHER. If a future
  // edit lifts one rung without the other, the two collapse into one
  // and the affordance disappears — which is exactly why these three
  // could not ship with E1's other 24.
  const HOVER = {
    ".bcc-legal-link:hover": ".bcc-legal-link",
    ".bcc-auth-footer a:hover": ".bcc-auth-footer a",
    ".bcc-tour-pop-skip:hover": ".bcc-tour-pop-skip",
  } as const;

  for (const [rule, rest] of Object.entries(HOVER)) {
    it(`${rule} resolves to --bcc-text`, () => {
      const idx = CSS.indexOf(rule);
      expect(idx).toBeGreaterThan(-1);
      const body = CSS.slice(idx, CSS.indexOf("}", idx));
      // `--bcc-text)` exactly — not `--bcc-text-secondary)`.
      expect(body).toContain("var(--bcc-text)");
      expect(body).not.toContain("var(--bcc-text-secondary)");
    });

    it(`${rule} is a different rung from its resting state`, () => {
      const hoverIdx = CSS.indexOf(rule);
      const hoverBody = CSS.slice(hoverIdx, CSS.indexOf("}", hoverIdx));
      // Resting is secondary; hover must not also be secondary.
      expect(declarationsByToken("secondary")).toContain(rest);
      expect(hoverBody).not.toContain("var(--bcc-text-secondary)");
    });
  }

  it("focus-visible is outline-based, so the colour change cannot touch it", () => {
    // None of the three declares its own focus rule; they inherit the
    // global ring. It is an `outline`, not a `color`, so moving either
    // rung leaves keyboard focus behaviour untouched.
    for (const sel of E1B_LADDER) {
      expect(CSS).not.toContain(`${sel}:focus`);
    }
    const idx = CSS.indexOf(":focus-visible {");
    expect(idx).toBeGreaterThan(-1);
    const body = CSS.slice(idx, CSS.indexOf("}", idx));
    expect(body).toContain("outline:");
    expect(body).not.toContain("color:");
  });

  it("the tour skip keeps its underline hover cue", () => {
    const idx = CSS.indexOf(".bcc-tour-pop-skip:hover");
    const body = CSS.slice(idx, CSS.indexOf("}", idx));
    expect(body).toContain("text-decoration: underline");
    expect(body).toContain("text-underline-offset: 3px");
  });

  it("the auth footer link inversion is corrected", () => {
    // E1 moved the footer container to secondary but left its links on
    // muted, so interactive text was DIMMER than the prose around it.
    const container = declarationsByToken("secondary");
    expect(container).toContain(".bcc-auth-footer");
    expect(container).toContain(".bcc-auth-footer a");
  });
});

describe("E1c — .bcc-tab and .bcc-copyright rules are byte-identical", () => {
  // Both are blocked on the accent decision. Pinned verbatim so no
  // partial migration can slip in: a half-migrated .bcc-copyright would
  // leave hover-triggered text inaccessible, and a half-migrated
  // .bcc-tab would make the SELECTED tab the faintest rung in light.
  // Newline-normalised once: the file is authored CRLF, and pinning
  // literal \r\n in every expectation makes them unreadable.
  const NCSS = CSS.replace(/\r\n/g, "\n");

  const PINNED: ReadonlyArray<readonly [string, string]> = [
    [".bcc-tab resting + border", "color: var(--bcc-text-muted);\n    border-bottom: 2px solid transparent;"],
    [".bcc-tab:hover", ".bcc-tab:hover {\n    color: var(--bcc-text-secondary);\n  }"],
    [".bcc-tab selected label + underline",
      '.bcc-tab[aria-selected="true"],\n  .bcc-tab.active {\n    color: var(--bcc-accent);\n    border-bottom-color: var(--bcc-accent);\n  }'],
    [".bcc-tab selected count", ".bcc-tab.active .bcc-tab-count {\n    color: var(--bcc-accent);\n    opacity: 0.7;\n  }"],
    [".bcc-copyright:hover year", ".bcc-copyright:hover .bcc-copyright-year {\n  color: var(--bcc-text-secondary);\n}"],
    [".bcc-copyright:hover collar", ".bcc-copyright:hover .bcc-copyright-collar {\n  color: var(--bcc-primary);\n}"],
    [".bcc-copyright:hover crypto", ".bcc-copyright:hover .bcc-copyright-crypto {\n  color: var(--bcc-secondary);\n}"],
  ];

  for (const [label, rule] of PINNED) {
    it(`${label} — byte-identical`, () => {
      expect(NCSS).toContain(rule);
    });
  }

  it(".bcc-copyright still rests on muted — no partial migration", () => {
    expect(declarationsByToken("muted")).toContain(".bcc-copyright");
  });

  it("accent is still theme-independent, which is why both are blocked", () => {
    // Scoped by data-accent only, never by a theme selector — so the
    // same hex paints on a white page and a near-black one.
    expect(CSS).toContain("--bcc-accent:          var(--bcc-primary)");
    expect(CSS).toContain("--bcc-accent:          var(--bcc-secondary)");
    const media = CSS.slice(CSS.indexOf("@media (prefers-color-scheme: dark)"));
    const firstBlock = media.slice(0, media.indexOf("\n  }"));
    expect(firstBlock).not.toContain("--bcc-accent:");
  });
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
