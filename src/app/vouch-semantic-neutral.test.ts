/**
 * Vouch is not a safety semantic.
 *
 * ## The ruling this file enforces (owner, 2026-08-17)
 *
 *   - neutral before vouching
 *   - verified after vouching
 *   - opaque backing, because the control appears in a portaled hovercard
 *
 * and, generally: "safety orange is primarily a warning mark, not a
 * translucent container for readable light text."
 *
 * ## Why the old spelling could not be repaired by re-colouring
 *
 * `AuthorVouchButton` has exactly one mount — `AuthorCard`, which hardcodes
 * `size="card"` — and `AuthorCard` has four homes:
 *
 *   AuthorBadge        → AuthorHoverPanel   (byline avatar hover)   portaled
 *   RightSidebar ×2    → AvatarHovercard                            portaled
 *   lib/format/mentions→ MentionHovercard   (every @mention)        portaled
 *   PostRightRail                                                   in-flow
 *
 * All four render the card on `--bcc-glass-bg-solid` — an 82% wash. Three of
 * them portal to `document.body` at `position: fixed`, `z-[500]`, so what is
 * behind the panel is *arbitrary page content*: a cream `.bcc-paper` sheet, a
 * dark surface, a photo. A translucent button on an unbounded backdrop has no
 * single contrast value to verify. The predecessor measured:
 *
 *   un-cast rest    2.28 – 3.39   (never passed, on any backdrop, in light)
 *   un-cast hover   2.03 – 2.93
 *   cast rest       2.86 – 5.38   (passed or failed purely by luck of backdrop)
 *   cast hover      4.44          (failed on every dark surface)
 *
 * Only an opaque fill closes that. So the assertions below are not "is the
 * colour nice" — they are "is the fill an opaque token in both themes, and is
 * the resulting ratio the SAME number on every backdrop." That second half is
 * the one that actually mattered, and it is proved by construction below with
 * a control that shows the check can still detect a backdrop-dependent fill.
 *
 * ## Scope
 *
 * The card variant lives in the four `.bcc-btn-vouch[-on][:hover]` rules in
 * `globals.css`; the byline variant lives in the `pillStyle` object literal in
 * `AuthorVouchButton.tsx`. Both are asserted, because a CSS-only repair leaves
 * the two divergent — which is how safety orange survived the last two passes
 * over this component.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

const CSS = read("src/app/globals.css");
const TSX = read("src/components/identity/AuthorVouchButton.tsx");
const CARD = read("src/components/identity/AuthorCard.tsx");
const DEMO = read("src/components/onboarding/reputation-demo/DemoAuthorCard.tsx");

// ─────────────────────────────────────────────────────────────────────────
// Colour maths — the same implementation the sibling contrast guards use.
// ─────────────────────────────────────────────────────────────────────────

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const chan = (hex: string) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lum = (hex: string) => {
  const [r, g, b] = chan(hex).map((c) => lin(c / 255));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
/** Composite `fg` at `alpha` over opaque `bg`. Never measure a wash raw. */
const over = (fg: string, bg: string, alpha: number) => {
  const [f, b] = [chan(fg), chan(bg)];
  const mix = f.map((c, i) => Math.round(c * alpha + (b[i] ?? 0) * (1 - alpha)));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Every declared value of `--<name>`, in source order (light, dark, dark). */
const decls = (name: string) =>
  [...CSS.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, "g"))].map((m) => m[1]?.trim() ?? "");

const OPAQUE_HEX = /^#[0-9a-f]{6}$/i;

/**
 * Resolve a `var(--token)` fill to its per-theme hex, refusing anything that
 * is not an opaque 6-digit hex in EVERY theme block. `transparent`, an alpha
 * wash, a `color-mix`, or a token that is opaque in light and translucent in
 * dark all come back as `null` — which is the whole point.
 */
function resolveOpaque(value: string): { light: string; dark: string } | null {
  const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(value.trim());
  if (m === null) return null;
  const name = (m[1] ?? "").replace(/^--/, "");
  const values = decls(name);
  if (values.length < 2) return null;
  if (!values.every((v) => OPAQUE_HEX.test(v))) return null;
  const [light, ...darks] = values;
  if (light === undefined || darks.length === 0) return null;
  if (new Set(darks).size !== 1) return null; // the two dark blocks must agree
  return { light, dark: darks[0] as string };
}

/** Resolve a colour that may be an alias chain (`--verified` → `--bcc-verified`). */
function resolveColour(value: string): { light: string; dark: string } | null {
  let current = value.trim();
  for (let hop = 0; hop < 4; hop += 1) {
    const direct = resolveOpaque(current);
    if (direct !== null) return direct;
    const m = /^var\(\s*(--[a-z0-9-]+)\s*\)$/i.exec(current);
    if (m === null) return null;
    const name = (m[1] ?? "").replace(/^--/, "");
    const aliases = decls(name).filter((v) => /^var\(/.test(v));
    if (aliases.length !== 1) return null;
    current = aliases[0] as string;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// The safety detector — spelled out, because a colour written as literal
// channels hides from every token grep.
// ─────────────────────────────────────────────────────────────────────────

const SAFETY_SPELLINGS: ReadonlyArray<readonly [string, RegExp]> = [
  ["--bcc-safety / --bcc-safety-rgb", /--bcc-safety\b/],
  ["--safety / --safety-rgb", /--safety(?:-rgb)?\b/],
  ["--ink-safety (must never exist)", /--ink-safety\b/],
  [
    "tailwind *-safety utility",
    /\b(?:text|bg|border|ring|fill|stroke|from|via|to|shadow|decoration|outline|accent|caret|divide|placeholder)-safety\b/,
  ],
  ["safety hex #f05a28", /#f05a28\b/i],
  ["safety channels 240 90 40", /\b240\s*[, ]\s*90\s*[, ]\s*40\b/],
];

/** All safety spellings present in `text`, by label. Empty array = clean. */
function safetyHits(text: string): string[] {
  return SAFETY_SPELLINGS.filter(([, re]) => re.test(text)).map(([label]) => label);
}

// ─────────────────────────────────────────────────────────────────────────
// Rule + declaration extraction
// ─────────────────────────────────────────────────────────────────────────

/** The exact body of one rule, comments stripped, `{}` included. */
function ruleOf(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // `(?![\w-])` stops `.bcc-btn-vouch` from matching `.bcc-btn-vouch-on`.
  const re = new RegExp(`${escaped}(?![\\w-])\\s*\\{[^}]*\\}`);
  return re.exec(CSS)?.[0] ?? "";
}

/** One declaration's value out of a rule body, or "" if absent. */
function declIn(rule: string, prop: string): string {
  const re = new RegExp(`(?:^|[;{\\s])${prop}\\s*:\\s*([^;}]+)`, "m");
  return re.exec(rule)?.[1]?.trim() ?? "";
}

/** The colour out of a `1.5px solid var(--x)` shorthand. */
function borderColour(shorthand: string): string {
  return shorthand.replace(/^\s*[\d.]+px\s+\w+\s+/, "").trim();
}

/** The width out of a `1.5px solid var(--x)` shorthand. */
function borderWidth(shorthand: string): string {
  return /^\s*([\d.]+px)\s/.exec(shorthand)?.[1] ?? "";
}

const SELECTORS = [
  ".bcc-btn-vouch",
  ".bcc-btn-vouch:hover",
  ".bcc-btn-vouch-on",
  ".bcc-btn-vouch-on:hover",
] as const;

const RULES = Object.fromEntries(SELECTORS.map((s) => [s, ruleOf(s)])) as Record<
  (typeof SELECTORS)[number],
  string
>;

/** The two branches of the byline `pillStyle` object literal. */
const PILL_STYLE = /const pillStyle = hasVouched\s*\?\s*\{([\s\S]*?)\}\s*:\s*\{([\s\S]*?)\};/.exec(TSX);
const PILL_CAST = PILL_STYLE?.[1] ?? "";
const PILL_UNCAST = PILL_STYLE?.[2] ?? "";

// ─────────────────────────────────────────────────────────────────────────
// 1. The scan surface is real before anything concludes
// ─────────────────────────────────────────────────────────────────────────

describe("preconditions — this guard scanned something", () => {
  it("read a real stylesheet and a real component", () => {
    expect(CSS.length).toBeGreaterThan(100_000);
    expect(CSS).toContain("@tailwind");
    expect(TSX.length).toBeGreaterThan(2_000);
    expect(TSX).toContain("export const AuthorVouchButton");
  });

  it("all four vouch rules were actually extracted, and are distinct", () => {
    for (const selector of SELECTORS) {
      expect(RULES[selector], `no rule matched for ${selector}`).not.toBe("");
      expect(RULES[selector]).toContain("{");
    }
    expect(new Set(Object.values(RULES)).size).toBe(4);
    // The un-cast extractor must not have swallowed the `-on` rule.
    expect(RULES[".bcc-btn-vouch"]).not.toContain("-vouch-on");
  });

  it("the byline pillStyle literal was actually extracted, both branches", () => {
    expect(PILL_STYLE, "pillStyle shape changed — this guard is now blind").not.toBeNull();
    expect(PILL_CAST).toContain("color:");
    expect(PILL_UNCAST).toContain("color:");
    expect(PILL_CAST).not.toBe(PILL_UNCAST);
  });

  it("the extractors do not silently return empty on a bogus selector", () => {
    expect(ruleOf(".bcc-btn-vouch-nonexistent")).toBe("");
    expect(declIn(RULES[".bcc-btn-vouch"], "font-size")).toBe("");
  });

  it("the compositor and the ratio maths work on known cases", () => {
    expect(over("#000000", "#ffffff", 0)).toBe("#ffffff");
    expect(over("#000000", "#ffffff", 1)).toBe("#000000");
    expect(round2(ratio("#000000", "#ffffff"))).toBe(21);
    expect(round2(ratio("#ffffff", "#ffffff"))).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The safety detector self-tests, both directions
// ─────────────────────────────────────────────────────────────────────────

describe("the safety detector is not scanning half the room", () => {
  const MUST_FLAG: ReadonlyArray<readonly [string, string]> = [
    ["aesthetic alias", `color: var(--safety);`],
    ["alias triplet wash", `background: rgb(var(--safety-rgb) / 0.12);`],
    ["canonical token", `border: 1.5px solid var(--bcc-safety);`],
    ["canonical triplet", `background: rgb(var(--bcc-safety-rgb) / 0.32);`],
    ["tailwind text utility", `className="bcc-mono text-safety"`],
    ["tailwind border utility with opacity", `className="border border-safety/40"`],
    ["tailwind bg utility", `className="bg-safety text-cardstock"`],
    ["literal hex", `background: #f05a28;`],
    ["literal hex, uppercase", `background: #F05A28;`],
    ["literal channels, comma form", `background: rgba(240, 90, 40, 0.12);`],
    ["literal channels, space form", `background: rgb(240 90 40 / 0.12);`],
    ["the forbidden new token", `--ink-safety: #f05a28;`],
  ];

  for (const [label, sample] of MUST_FLAG) {
    it(`flags: ${label}`, () => {
      expect(safetyHits(sample).length).toBeGreaterThan(0);
    });
  }

  const MUST_NOT_FLAG: ReadonlyArray<readonly [string, string]> = [
    ["the English word in a comment", `/* safety orange is a warning mark, not a container */`],
    ["the verified token", `color: var(--verified);`],
    ["the neutral fill", `background: var(--bcc-surface-hover);`],
    ["the neutral text token", `color: var(--bcc-text);`],
    ["the neutral border token", `border: 1.5px solid var(--bcc-border);`],
    ["a weld wash — different token, out of scope", `background: rgb(var(--weld-rgb) / 0.10);`],
    ["digits that merely contain the channels", `z-index: 24090;`],
    ["lengths that look like channels but are not", `padding: 240px 90px 40px;`],
    ["a safety-free hex", `background: #f05a29;`],
  ];

  for (const [label, sample] of MUST_NOT_FLAG) {
    it(`ignores: ${label}`, () => {
      expect(safetyHits(sample)).toEqual([]);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 3. No safety token of any spelling survives in the component or its CSS
// ─────────────────────────────────────────────────────────────────────────

describe("safety orange is gone from vouch, both variants", () => {
  for (const selector of SELECTORS) {
    it(`${selector} carries no safety spelling`, () => {
      expect(safetyHits(RULES[selector])).toEqual([]);
    });
  }

  it("the component file carries no safety spelling at all", () => {
    expect(safetyHits(TSX)).toEqual([]);
  });

  it("the demo that mirrors these classes carries none either", () => {
    // DemoAuthorCard re-declares the same class names rather than importing
    // the component, so it is the obvious place for the semantic to re-grow.
    expect(DEMO).toContain("bcc-btn-vouch-on");
    expect(DEMO).toContain("bcc-btn-vouch");
    expect(safetyHits(DEMO)).toEqual([]);
  });

  it("the safety tokens themselves are untouched — this slice recoloured nothing", () => {
    expect(decls("bcc-safety")).toEqual(["#f05a28"]);
    expect(decls("safety-rgb")).toEqual(["240 90 40"]);
    expect(decls("safety")).toEqual(["var(--bcc-safety)"]);
    expect(CSS).not.toMatch(/--ink-safety\b/);
    // And safety still has real consumers elsewhere — this was a semantic
    // correction in one component, not a token retirement.
    expect([...CSS.matchAll(/var\(--safety\)/g)].length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. The two states hold their intended tokens
// ─────────────────────────────────────────────────────────────────────────

describe("un-cast is NEUTRAL", () => {
  const rest = RULES[".bcc-btn-vouch"];
  const hover = RULES[".bcc-btn-vouch:hover"];

  it("rest: neutral fill, neutral text, neutral border", () => {
    expect(declIn(rest, "background")).toBe("var(--bcc-surface-hover)");
    expect(declIn(rest, "color")).toBe("var(--bcc-text)");
    expect(borderColour(declIn(rest, "border"))).toBe("var(--bcc-border)");
  });

  it("hover advances one interaction step and stays neutral", () => {
    expect(declIn(hover, "background")).toBe("var(--bcc-surface-active)");
    expect(declIn(hover, "opacity")).toBe("1");
  });

  it("it is the same token set as the canonical neutral Vouch already shipped", () => {
    // AttestationActionCluster's "positive" (Vouch) variant is the precedent
    // this state was matched to. If that moves, this should be reviewed too.
    const cluster = read("src/components/profile/AttestationActionCluster.tsx");
    expect(cluster).toContain(
      "border border-bcc-border bg-bcc-surface-hover text-bcc-text hover:bg-bcc-surface-active",
    );
  });
});

describe("cast is VERIFIED", () => {
  const rest = RULES[".bcc-btn-vouch-on"];
  const hover = RULES[".bcc-btn-vouch-on:hover"];

  it("rest: verified text on an opaque neutral plate, full-strength verified border", () => {
    expect(declIn(rest, "background")).toBe("var(--bcc-surface)");
    expect(declIn(rest, "color")).toBe("var(--verified)");
    expect(borderColour(declIn(rest, "border"))).toBe("var(--verified)");
  });

  it("hover lifts one elevation step and keeps the verified label", () => {
    expect(declIn(hover, "background")).toBe("var(--bcc-surface-raised)");
    expect(declIn(hover, "opacity")).toBe("1");
    // The 4.44-on-dark hover that this slice was opened for.
    expect(declIn(hover, "background")).not.toBe("var(--bcc-surface-hover)");
  });

  it("no verified wash of any alpha sits under the verified label", () => {
    for (const r of [rest, hover]) {
      expect(r).not.toMatch(/background[^;]*rgb\(var\(--verified-rgb\)\s*\/\s*0?\.\d+\)/);
      expect(r).not.toMatch(/\bbg-verified\/\d/);
    }
  });
});

describe("the byline variant did not stay behind", () => {
  it("un-cast uses the card's neutral tokens at byline weight", () => {
    expect(PILL_UNCAST).toContain('color: "var(--bcc-text)"');
    expect(PILL_UNCAST).toContain('background: "var(--bcc-surface-hover)"');
    expect(PILL_UNCAST).toContain('border: "1px solid var(--bcc-border)"');
  });

  it("cast uses the card's verified tokens at byline weight", () => {
    expect(PILL_CAST).toContain('color: "var(--verified)"');
    expect(PILL_CAST).toContain('background: "var(--bcc-surface)"');
    expect(PILL_CAST).toContain('border: "1px solid var(--verified)"');
  });

  it("the two variants cannot drift: same fill and text tokens, either state", () => {
    const cardTokens = (rule: string) => [declIn(rule, "background"), declIn(rule, "color")];
    const bylineTokens = (branch: string) =>
      [/background:\s*"([^"]+)"/, /color:\s*"([^"]+)"/].map((re) => re.exec(branch)?.[1] ?? "");
    expect(bylineTokens(PILL_UNCAST)).toEqual(cardTokens(RULES[".bcc-btn-vouch"]));
    expect(bylineTokens(PILL_CAST)).toEqual(cardTokens(RULES[".bcc-btn-vouch-on"]));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. The opaque backing is present — and it is what makes the number stable
// ─────────────────────────────────────────────────────────────────────────

/**
 * Backdrops a portaled hovercard can genuinely land on. Not hypotheticals:
 * `#f4ecd8` is the fixed-cream `.bcc-paper` family, `#161b22`/`#0d1117` are
 * the dark app surfaces, and the greys stand in for photo content.
 */
const BACKDROPS: ReadonlyArray<readonly [string, string]> = [
  ["white page", "#ffffff"],
  ["cream .bcc-paper sheet", "#f4ecd8"],
  ["dark surface", "#161b22"],
  ["near-black page", "#0d1117"],
  ["light image", "#e8e8e8"],
  ["mid-grey image", "#808080"],
];

/** `--bcc-glass-bg-solid`, read from the sheet rather than assumed. */
const GLASS = decls("bcc-glass-bg-solid").map((v) => {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/.exec(v);
  const [, r, g, b, a] = m ?? [];
  return {
    hex: `#${[r, g, b].map((c) => Number(c).toString(16).padStart(2, "0")).join("")}`,
    alpha: Number(a),
  };
});

const THEMES = ["light", "dark"] as const;
type Theme = (typeof THEMES)[number];

/** The panel colour the button sits on, for a given theme and backdrop. */
function panelOver(theme: Theme, backdrop: string): string {
  const g = theme === "light" ? GLASS[0] : GLASS[1];
  if (g === undefined) throw new Error("glass token not parsed");
  return over(g.hex, backdrop, g.alpha);
}

const STATES = [
  [".bcc-btn-vouch", "un-cast rest"],
  [".bcc-btn-vouch:hover", "un-cast hover"],
  [".bcc-btn-vouch-on", "cast rest"],
  [".bcc-btn-vouch-on:hover", "cast hover"],
] as const;

describe("the opaque backing is present, in both themes", () => {
  it("the glass panel really is translucent — the premise of this section", () => {
    expect(GLASS).toHaveLength(3);
    for (const g of GLASS) {
      expect(g.alpha).toBeGreaterThan(0);
      expect(g.alpha).toBeLessThan(1);
    }
  });

  it("every vouch state declares a fill, and none of them is transparent", () => {
    for (const [selector] of STATES) {
      const fill = declIn(RULES[selector], "background");
      expect(fill, `${selector} declares no background`).not.toBe("");
      expect(fill).not.toBe("transparent");
      expect(fill).not.toMatch(/\/\s*0?\.\d+\s*\)/); // no alpha wash
      expect(fill).not.toMatch(/color-mix/);
    }
  });

  it("every fill resolves to an opaque hex in BOTH themes", () => {
    for (const [selector] of STATES) {
      const resolved = resolveOpaque(declIn(RULES[selector], "background"));
      expect(resolved, `${selector} fill is not an opaque per-theme token`).not.toBeNull();
      expect(OPAQUE_HEX.test(resolved?.light ?? "")).toBe(true);
      expect(OPAQUE_HEX.test(resolved?.dark ?? "")).toBe(true);
    }
  });

  it("the byline fills resolve to opaque hexes too", () => {
    for (const branch of [PILL_UNCAST, PILL_CAST]) {
      const value = /background:\s*"([^"]+)"/.exec(branch)?.[1] ?? "";
      expect(resolveOpaque(value)).not.toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. Backdrop independence, proved — with a control that can still fail
// ─────────────────────────────────────────────────────────────────────────

/**
 * Measure one state over one backdrop the way a browser would: composite the
 * glass panel onto the backdrop, then composite the button's fill onto that
 * panel at whatever alpha the fill carries. An opaque fill makes the second
 * step a no-op, which is exactly the property being asserted.
 */
function measure(theme: Theme, selector: (typeof SELECTORS)[number], backdrop: string): number {
  const rule = RULES[selector];
  const restRule = selector.endsWith(":hover")
    ? RULES[selector.replace(":hover", "") as (typeof SELECTORS)[number]]
    : rule;
  const fillValue = declIn(rule, "background");
  const textValue = declIn(rule, "color") || declIn(restRule, "color");

  const panel = panelOver(theme, backdrop);
  const fill = resolveOpaque(fillValue);
  const text = resolveColour(textValue);
  if (text === null) throw new Error(`unresolvable text colour: ${textValue}`);
  const fillHex = fill === null ? panel : fill[theme];
  return ratio(text[theme], fillHex);
}

describe("contrast is backdrop-independent, and clears 4.5:1 everywhere", () => {
  for (const theme of THEMES) {
    for (const [selector, label] of STATES) {
      it(`${theme} · ${label} — one number on all ${BACKDROPS.length} backdrops`, () => {
        const values = BACKDROPS.map(([, b]) => round2(measure(theme, selector, b)));
        expect(new Set(values).size, `varies with the backdrop: ${values.join(" / ")}`).toBe(1);
        expect(values[0]).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  it("the recorded table — these are the numbers the slice shipped", () => {
    const table = Object.fromEntries(
      THEMES.flatMap((theme) =>
        STATES.map(([selector, label]) => [
          `${theme} ${label}`,
          round2(measure(theme, selector, "#ffffff")),
        ]),
      ),
    );
    expect(table).toEqual({
      "light un-cast rest": 16.12,
      "light un-cast hover": 15.54,
      "light cast rest": 5.38,
      "light cast hover": 5.11,
      "dark un-cast rest": 12.88,
      "dark un-cast hover": 11.57,
      "dark cast rest": 5.04,
      "dark cast hover": 4.72,
    });
  });

  it("CONTROL — the check still detects a backdrop-dependent fill", () => {
    // Exactly the predecessor's un-cast rest: transparent, safety text. If
    // the invariance assertion above were vacuous, this would also come back
    // with one value. It does not.
    const safety = decls("bcc-safety")[0] ?? "";
    expect(OPAQUE_HEX.test(safety)).toBe(true);
    const before = BACKDROPS.map(([, b]) => round2(ratio(safety, panelOver("light", b))));
    expect(new Set(before).size).toBeGreaterThan(1);
    expect(Math.min(...before)).toBeLessThan(4.5);
    expect(Math.max(...before)).toBeLessThan(4.5); // never passed, on any backdrop
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 7. Boundaries — load-bearing where it has to be, decorative where recorded
// ─────────────────────────────────────────────────────────────────────────

describe("the control's boundary", () => {
  it("the cast border is load-bearing and clears 3:1 against its own fill", () => {
    // On the matching theme the cast plate is the same colour as the glass
    // panel behind it (--bcc-surface both sides), so the border is the ONLY
    // boundary. That removes it from the decorative-border ruling.
    for (const selector of [".bcc-btn-vouch-on", ".bcc-btn-vouch-on:hover"] as const) {
      const rest = RULES[".bcc-btn-vouch-on"];
      const colour = resolveColour(borderColour(declIn(rest, "border")));
      const fill = resolveOpaque(declIn(RULES[selector], "background"));
      expect(colour).not.toBeNull();
      expect(fill).not.toBeNull();
      for (const theme of THEMES) {
        expect(
          ratio(colour?.[theme] ?? "", fill?.[theme] ?? ""),
          `${selector} border on ${theme}`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("the un-cast border is recorded as decorative, not claimed as compliant", () => {
    // --bcc-border against its own fill is 1.13 light / 1.25 dark. That is
    // NOT asserted as passing 1.4.11 — the chip is identified by its own
    // "VOUCH" label (16.12 / 12.88) and by the Follow pill beside it, which
    // is how the canonical neutral Vouch already ships. Recorded so a future
    // reader does not mistake silence for a measurement.
    const colour = resolveColour(borderColour(declIn(RULES[".bcc-btn-vouch"], "border")));
    const fill = resolveOpaque(declIn(RULES[".bcc-btn-vouch"], "background"));
    expect(round2(ratio(colour?.light ?? "", fill?.light ?? ""))).toBe(1.13);
    expect(round2(ratio(colour?.dark ?? "", fill?.dark ?? ""))).toBe(1.25);
    // The label carrying the identification is the thing that must not slip.
    expect(round2(measure("light", ".bcc-btn-vouch", "#ffffff"))).toBeGreaterThanOrEqual(7);
    expect(round2(measure("dark", ".bcc-btn-vouch", "#ffffff"))).toBeGreaterThanOrEqual(7);
  });

  it("geometry is preserved — 1.5px, peering with the Follow pill", () => {
    // .bcc-btn-outline is what MemberFollowButton renders beside this.
    expect(borderWidth(declIn(ruleOf(".bcc-btn-outline"), "border"))).toBe("1.5px");
    expect(borderWidth(declIn(RULES[".bcc-btn-vouch"], "border"))).toBe("1.5px");
    expect(borderWidth(declIn(RULES[".bcc-btn-vouch-on"], "border"))).toBe("1.5px");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 8. Behaviour that the recolour was not allowed to touch
// ─────────────────────────────────────────────────────────────────────────

describe("the semantics under the paint are unchanged", () => {
  it("accessible naming, pressed/busy state and the pending labels survive", () => {
    expect(TSX).toContain("aria-pressed={hasVouched}");
    expect(TSX).toContain("aria-busy={isPending}");
    expect(TSX).toContain("`Remove your vouch for ${displayName}`");
    expect(TSX).toContain("`Vouch for ${displayName}`");
    expect(TSX).toContain('"REVOKING…"');
    expect(TSX).toContain('"VOUCHING…"');
    expect(TSX).toContain('"VOUCHED"');
    expect(TSX).toContain("disabled={isPending}");
  });

  it("the action semantics still go through the attestation hooks", () => {
    expect(TSX).toContain('kind: "vouch"');
    expect(TSX).toContain('target_kind: "user_profile"');
    expect(TSX).toContain("revokeMutation.mutate(viewerAttestation.vouch.id)");
    // One vouch per person: cast is only reachable when there is no vouch id.
    expect(TSX).toContain("if (hasVouched && viewerAttestation?.vouch?.id != null)");
  });

  it("focus stays on the global ring — no per-component override was added", () => {
    expect(TSX).not.toMatch(/focus-visible:/);
    for (const selector of SELECTORS) {
      expect(RULES[selector]).not.toContain("outline");
    }
    expect(CSS).toMatch(/:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--bcc-focus-ring\)/);
  });

  it("the card variant is still the one the app mounts", () => {
    expect(CARD).toContain('size="card"');
    expect(TSX).toContain('bcc-btn bcc-btn-sm w-full ${hasVouched ? "bcc-btn-vouch-on" : "bcc-btn-vouch"}');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 9. Mutation controls — with the substitution count asserted every time
// ─────────────────────────────────────────────────────────────────────────

/** Replace and ASSERT how many replacements happened. A silent zero-hit
 *  substitution is how a mutation suite convinces itself it is working. */
function substitute(src: string, from: string, to: string, expected: number): string {
  const parts = src.split(from);
  expect(parts.length - 1, `substitutions of ${JSON.stringify(from)}`).toBe(expected);
  return parts.join(to);
}

const countOf = (src: string, needle: string) => src.split(needle).length - 1;

describe("mutation controls — each detector is shown to fail on a real break", () => {
  it("baseline: the live rules are clean, so a flip below means the mutation", () => {
    expect(safetyHits(RULES[".bcc-btn-vouch"])).toEqual([]);
    expect(safetyHits(RULES[".bcc-btn-vouch:hover"])).toEqual([]);
    expect(countOf(RULES[".bcc-btn-vouch"], "var(--safety)")).toBe(0);
    expect(countOf(RULES[".bcc-btn-vouch:hover"], "--safety-rgb")).toBe(0);
    expect(countOf(TSX, "var(--safety)")).toBe(0);
  });

  it("M1 — safety text reintroduced in the un-cast rule (1 substitution)", () => {
    const mutated = substitute(
      RULES[".bcc-btn-vouch"],
      "color: var(--bcc-text);",
      "color: var(--safety);",
      1,
    );
    expect(safetyHits(mutated)).toEqual(["--safety / --safety-rgb"]);
  });

  it("M2 — safety as literal channels, the spelling that hides from a token grep (1)", () => {
    const mutated = substitute(
      RULES[".bcc-btn-vouch:hover"],
      "background: var(--bcc-surface-active);",
      "background: rgba(240, 90, 40, 0.12);",
      1,
    );
    expect(safetyHits(mutated)).toEqual(["safety channels 240 90 40"]);
    // …and it is also no longer an opaque fill, so two detectors fire.
    expect(resolveOpaque(declIn(mutated, "background"))).toBeNull();
  });

  it("M3 — safety as a literal hex in the byline branch (1)", () => {
    const mutated = substitute(
      PILL_UNCAST,
      'color: "var(--bcc-text)"',
      'color: "#F05A28"',
      1,
    );
    expect(safetyHits(mutated)).toEqual(["safety hex #f05a28"]);
  });

  it("M4 — the fill goes transparent again (1 substitution)", () => {
    const mutated = substitute(
      RULES[".bcc-btn-vouch"],
      "background: var(--bcc-surface-hover);",
      "background: transparent;",
      1,
    );
    expect(declIn(mutated, "background")).toBe("transparent");
    expect(resolveOpaque(declIn(mutated, "background"))).toBeNull();
  });

  it("M5 — the fill becomes an alpha wash (1 substitution)", () => {
    const mutated = substitute(
      RULES[".bcc-btn-vouch-on"],
      "background: var(--bcc-surface);",
      "background: rgb(var(--bcc-surface-rgb) / 0.6);",
      1,
    );
    expect(resolveOpaque(declIn(mutated, "background"))).toBeNull();
    expect(declIn(mutated, "background")).toMatch(/\/\s*0?\.\d+\s*\)/);
  });

  it("M6 — the cast border weakens back to a 0.45 wash (1 substitution)", () => {
    const mutated = substitute(
      RULES[".bcc-btn-vouch-on"],
      "border: 1.5px solid var(--verified);",
      "border: 1.5px solid rgb(var(--verified-rgb) / 0.45);",
      1,
    );
    const colour = borderColour(declIn(mutated, "border"));
    expect(resolveColour(colour)).toBeNull(); // not resolvable as an opaque edge
    // Flattened, it lands at 2.11 light / 2.21 dark — under 3:1.
    const light = over("#20794e", "#ffffff", 0.45);
    expect(ratio(light, "#ffffff")).toBeLessThan(3);
  });

  it("M7 — the cast hover slides back onto surface-hover, the 4.44 dark case (1)", () => {
    const mutated = substitute(
      RULES[".bcc-btn-vouch-on:hover"],
      "background: var(--bcc-surface-raised);",
      "background: var(--bcc-surface-hover);",
      1,
    );
    const fill = resolveOpaque(declIn(mutated, "background"));
    const text = resolveColour(declIn(RULES[".bcc-btn-vouch-on"], "color"));
    expect(round2(ratio(text?.dark ?? "", fill?.dark ?? ""))).toBe(4.44);
    expect(ratio(text?.dark ?? "", fill?.dark ?? "")).toBeLessThan(4.5);
  });

  it("M8 — geometry break: the 1.5px peer height goes to 1px (1 substitution)", () => {
    const mutated = substitute(RULES[".bcc-btn-vouch"], "1.5px", "1px", 1);
    expect(borderWidth(declIn(mutated, "border"))).toBe("1px");
    // …while safety and opacity stay clean, so this mutation is isolated.
    expect(safetyHits(mutated)).toEqual([]);
    expect(resolveOpaque(declIn(mutated, "background"))).not.toBeNull();
  });

  it("M9 — NEGATIVE control: an equivalent opaque token must NOT flip anything", () => {
    const mutated = substitute(
      RULES[".bcc-btn-vouch"],
      "background: var(--bcc-surface-hover);",
      "background: var(--bcc-surface-active);",
      1,
    );
    expect(safetyHits(mutated)).toEqual([]);
    const fill = resolveOpaque(declIn(mutated, "background"));
    const text = resolveColour(declIn(mutated, "color"));
    expect(fill).not.toBeNull();
    for (const theme of THEMES) {
      expect(ratio(text?.[theme] ?? "", fill?.[theme] ?? "")).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("M10 — NEGATIVE control: a comment mentioning safety must NOT flip the detector", () => {
    const mutated = substitute(
      RULES[".bcc-btn-vouch"],
      "color: var(--bcc-text);",
      "color: var(--bcc-text); /* not safety orange — vouch invites */",
      1,
    );
    expect(safetyHits(mutated)).toEqual([]);
  });
});
