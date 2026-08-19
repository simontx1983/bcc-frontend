/**
 * The reputation-demo Vouch burst must not paint over its own label.
 *
 * `.bcc-rep-demo-bloom` was an `inset: 0`, `position: absolute` layer
 * carrying a verified radial wash at 0.28 alpha, rendered as a SIBLING
 * AFTER the demo's Vouch button. Positioned siblings paint above
 * in-flow content, so for the full 900ms of the animation the tint sat
 * over the button face and its label:
 *
 *   label on the bare panel        5.38 light / 5.04 dark
 *   label under the 28% bloom      3.60 light / 3.38 dark
 *
 * i.e. a live instance of the tint-under-readable-text pattern the
 * verified slice was created to eliminate (see phosphor-confinement).
 *
 * ## Why re-layering alone was not the fix
 *
 * The obvious repair — put the decoration behind the button — does not
 * work here, and that is the interesting part. `.bcc-btn-vouch` and
 * `.bcc-btn-vouch-on` are transparent-faced (outline buttons; the `-on`
 * state deliberately carries NO fill, for exactly the contrast reason
 * above). A tint parked behind a transparent button still composites
 * under the glyphs, so the measured ratio would not move.
 *
 * So the burst stopped being a fill. It is a border ring that starts at
 * the pill's edge and expands past it: a border is drawn at the box
 * boundary, where no text lives, so no layering accident can put it under
 * the label again. Colour, 900ms duration, ease-out/forwards, the
 * reduced-motion skip and the sparkle fan are all unchanged.
 *
 * Layering is still asserted below — belt and braces, and it documents
 * intent — but the ring is what makes the invariant structural.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const CSS = read("src/app/globals.css");
const DEMO = read("src/components/onboarding/reputation-demo/DemoAuthorCard.tsx");

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");

// ─────────────────────────────────────────────────────────────────────────
// Extractors + detectors
// ─────────────────────────────────────────────────────────────────────────

/**
 * Every rule body for a selector, comments removed — a fill quoted in
 * prose is not a fill. More than one is normal: the reduced-motion media
 * block re-states these selectors as a group.
 */
function ruleBodies(css: string, selector: string): string[] {
  const re = new RegExp(`\\${selector}\\s*\\{[^}]*\\}`, "g");
  return [...css.matchAll(re)].map((m) => stripComments(m[0]));
}

/** The first (base) rule body for a selector. */
function ruleBody(css: string, selector: string): string {
  return ruleBodies(css, selector)[0] ?? "";
}

/** Any background-ish declaration inside a rule body. */
function fillDecls(body: string): string[] {
  return [...body.matchAll(/(background(?:-color|-image)?)\s*:\s*([^;]+);/g)].map(
    (m) => `${m[1]}: ${(m[2] ?? "").trim()}`,
  );
}

/**
 * Does the decoration render BEFORE the control it decorates, with the
 * control positioned so it paints last?
 */
function bloomIsBehindButton(src: string): boolean {
  const bloom = src.indexOf('"bcc-rep-demo-bloom"');
  const button = src.indexOf("aria-pressed={vouched}");
  if (bloom === -1 || button === -1) return false;
  const buttonClass = /aria-pressed=\{vouched\}\s*\r?\n\s*className=\{"([^"]+)"/.exec(src)?.[1] ?? "";
  return bloom < button && /\brelative\b/.test(buttonClass);
}

const BLOOM = ruleBody(CSS, ".bcc-rep-demo-bloom");
const KEYFRAMES =
  /@keyframes\s+bcc-rep-demo-bloom\s*\{[\s\S]*?\n\}/.exec(CSS)?.[0] ?? "";

// ─────────────────────────────────────────────────────────────────────────
// 1. The scan proves itself
// ─────────────────────────────────────────────────────────────────────────

describe("rep-demo bloom — preconditions", () => {
  it("found exactly one bloom rule, one keyframes block and the consumer", () => {
    expect(ruleBodies(CSS, ".bcc-rep-demo-bloom")).toHaveLength(1);
    expect(BLOOM, ".bcc-rep-demo-bloom rule not found").not.toBe("");
    expect(BLOOM).toContain("position: absolute");
    expect(KEYFRAMES).not.toBe("");
    expect(DEMO).toContain("bcc-rep-demo-bloom");
    expect(CSS.length).toBeGreaterThan(50_000);
  });

  it("the fill detector reads a real rule, not an empty string", () => {
    // A sibling rule that legitimately DOES carry a background proves the
    // detector fires on this stylesheet rather than returning [] for free.
    expect(fillDecls(ruleBody(CSS, ".bcc-btn-primary")).length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. THE INVARIANT — the burst carries no fill
// ─────────────────────────────────────────────────────────────────────────

describe("the burst is a ring, not a tint", () => {
  it("the bloom rule declares no background of any kind", () => {
    expect(
      fillDecls(BLOOM),
      "a fill on an inset:0 layer sits under the button label",
    ).toEqual([]);
  });

  it("it is a verified border instead", () => {
    expect(BLOOM).toMatch(/border:\s*1\.5px solid var\(--verified\)/);
    expect(BLOOM).toContain("border-radius: var(--bcc-radius-sm)");
  });

  it("it stays inert and non-interactive", () => {
    expect(BLOOM).toContain("pointer-events: none");
    expect(BLOOM).toContain("inset: 0");
  });

  it("it is layered behind the button it decorates", () => {
    expect(BLOOM).toMatch(/z-index:\s*0/);
    expect(bloomIsBehindButton(DEMO)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The animation's intent survived
// ─────────────────────────────────────────────────────────────────────────

describe("duration, easing and the reduced-motion skip are untouched", () => {
  it("still 900ms ease-out forwards, still its own keyframes", () => {
    expect(BLOOM).toMatch(/animation:\s*bcc-rep-demo-bloom 900ms ease-out forwards/);
  });

  it("still fades in fast and out slow", () => {
    expect(KEYFRAMES).toMatch(/0%\s*\{[^}]*opacity:\s*0/);
    expect(KEYFRAMES).toMatch(/25%\s*\{[^}]*opacity:\s*1/);
    expect(KEYFRAMES).toMatch(/100%\s*\{[^}]*opacity:\s*0/);
  });

  it("the ring's growth is bounded well inside the gap to neighbouring text", () => {
    // The tooltip below sits 6px away (gap-1.5) and the counts row 12px
    // above. On a ~26px-tall pill a 1.16 ceiling reaches ~2px past each
    // edge, so the ring cannot tint text either side of the button.
    const scales = [...KEYFRAMES.matchAll(/scale\((\d+(?:\.\d+)?)\)/g)].map((m) =>
      Number(m[1] ?? "0"),
    );
    expect(scales.length).toBeGreaterThanOrEqual(2);
    expect(Math.max(...scales)).toBeGreaterThan(1); // it does expand
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.2); // but not into the tooltip
  });

  it("reduced motion still gets no animation at all, not a shorter one", () => {
    expect(DEMO).toContain('className={reducedMotion ? "" : "bcc-rep-demo-bloom"}');
    expect(DEMO).toContain("{!reducedMotion &&");
  });

  it("the CSS-side reduced-motion guard still covers the bloom", () => {
    // Belt and braces with the React-side skip above: even if the class is
    // applied, the media block removes it outright.
    const rm =
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.bcc-rep-demo-swap,[\s\S]*?\n\}/.exec(
        CSS,
      )?.[0] ?? "";
    expect(rm, "the rep-demo reduced-motion block is gone").not.toBe("");
    expect(rm).toContain(".bcc-rep-demo-bloom");
    expect(rm).toContain("animation: none !important");
    expect(rm).toContain("display: none");
  });

  it("the decoration stays hidden from assistive tech", () => {
    expect(DEMO).toMatch(/aria-hidden[\s\S]{0,120}bcc-rep-demo-bloom/);
  });

  it("the sparkle fan is untouched", () => {
    expect(DEMO).toContain('className="bcc-rep-demo-vouch-sparkle"');
    // Two bodies: the base rule and its member of the reduced-motion group.
    expect(ruleBodies(CSS, ".bcc-rep-demo-vouch-sparkle")).toHaveLength(2);
    expect(ruleBody(CSS, ".bcc-rep-demo-vouch-sparkle")).toMatch(
      /animation:\s*bcc-rep-demo-vouch-sparkle 700ms/,
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Mutation controls — with asserted substitution counts
// ─────────────────────────────────────────────────────────────────────────

describe("the guards fail when the defect comes back", () => {
  it("re-adding the old wash to the rule is caught (1 substitution)", () => {
    const marker = "  border: 1.5px solid var(--verified);";
    const count = BLOOM.split(marker.trim()).length - 1;
    expect(count, "mutation control substituted nothing").toBe(1);
    const mutated = BLOOM.split(marker.trim()).join(
      "background: radial-gradient(ellipse 70% 60% at 50% 100%, rgb(var(--verified-rgb) / 0.28), transparent 70%);",
    );
    expect(fillDecls(mutated)).toHaveLength(1);
  });

  it("a plain background-color regression is caught too", () => {
    expect(fillDecls(".x { background-color: rgb(var(--verified-rgb) / 0.1); }")).toHaveLength(1);
    expect(fillDecls(".x { background-image: linear-gradient(red, blue); }")).toHaveLength(1);
    // …and a border-only rule is NOT a false positive.
    expect(fillDecls(".x { border: 1.5px solid var(--verified); }")).toEqual([]);
  });

  it("dropping `relative` from the button breaks the layering check (1 substitution)", () => {
    const count = DEMO.split("bcc-btn bcc-btn-sm relative w-full ").length - 1;
    expect(count, "mutation control substituted nothing").toBe(1);
    const mutated = DEMO.split("bcc-btn bcc-btn-sm relative w-full ").join(
      "bcc-btn bcc-btn-sm w-full ",
    );
    expect(bloomIsBehindButton(DEMO)).toBe(true);
    expect(bloomIsBehindButton(mutated)).toBe(false);
  });

  it("putting the decoration back after the button is caught", () => {
    const AFTER = [
      '<button aria-pressed={vouched}',
      '  className={"bcc-btn bcc-btn-sm relative w-full "}>Vouch</button>',
      '<span className="bcc-rep-demo-bloom" />',
    ].join("\n");
    const BEFORE = [
      '<span className="bcc-rep-demo-bloom" />',
      '<button aria-pressed={vouched}',
      '  className={"bcc-btn bcc-btn-sm relative w-full "}>Vouch</button>',
    ].join("\n");
    expect(bloomIsBehindButton(AFTER)).toBe(false);
    expect(bloomIsBehindButton(BEFORE)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. The measurement that forced all of this
// ─────────────────────────────────────────────────────────────────────────

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const channels = (hex: string) => {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const lum = (hex: string) => {
  const [r, g, b] = channels(hex).map((v) => lin(v / 255));
  return 0.2126 * (r ?? 0) + 0.7152 * (g ?? 0) + 0.0722 * (b ?? 0);
};
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const over = (fg: string, bg: string, alpha: number) => {
  const [f, b] = [channels(fg), channels(bg)];
  return (
    "#" +
    f
      .map((v, i) => Math.round(alpha * v + (1 - alpha) * (b[i] ?? 0)))
      .map((v) => v.toString(16).padStart(2, "0"))
      .join("")
  );
};
const decls = (n: string) =>
  [...CSS.matchAll(new RegExp(`--${n}:\\s*([^;]+);`, "g"))].map((m) => m[1]?.trim() ?? "");

describe("the label now reads on the bare panel", () => {
  const [vLight, vDark] = [decls("bcc-verified")[0] ?? "", decls("bcc-verified")[1] ?? ""];

  it("measures the shipped verified values, not stand-ins", () => {
    expect([vLight, vDark]).toEqual(["#20794e", "#2c9d66"]);
  });

  it("the VOUCHED label clears 4.5:1 on the demo card in both themes", () => {
    // `.bcc-panel` is --bcc-surface: #ffffff light, #161b22 dark.
    expect(ratio(vLight, "#ffffff")).toBeGreaterThanOrEqual(4.5); // 5.38
    expect(ratio(vDark, "#161b22")).toBeGreaterThanOrEqual(4.5); // 5.04
  });

  it("records why the fill could not simply be dimmed or re-layered", () => {
    // The counterfactual, not a shipped state: a 28% verified wash under the
    // verified label fails AA in both themes, which is why the decoration
    // had to change shape rather than change alpha. This half of the argument
    // is about the tint itself and holds regardless of the button.
    expect(ratio(vLight, over(vLight, "#ffffff", 0.28))).toBeLessThan(4.5); // 3.60
    expect(ratio(vDark, over(vDark, "#161b22", 0.28))).toBeLessThan(4.5); // 3.38

    /**
     * REVISED after rebasing onto the vouch-semantic slice.
     *
     * This originally asserted the button had NO face of its own — `.bcc-btn-vouch`
     * was `transparent` and `.bcc-btn-vouch-on` declared no background at all — so
     * a tint behind it still composited under the glyphs and re-layering was a
     * no-op. That was true when written and is now false: the vouch slice gave
     * both states an opaque plate.
     *
     * The conclusion survives, on the opposite mechanism. The bloom is
     * `position: absolute; inset: 0` — exactly the button's box. Behind an
     * OPAQUE same-size plate it is not partly visible, it is entirely occluded,
     * so re-layering a fill now deletes the effect rather than rescuing it.
     * A fill is unusable whether the button is transparent (composites onto the
     * label) or opaque (hidden completely). Only a mark drawn at or past the box
     * edge survives — which is what the ring is, and why the keyframes scale
     * past 1.0.
     */
    const vouch = ruleBody(CSS, ".bcc-btn-vouch");
    const vouchOn = ruleBody(CSS, ".bcc-btn-vouch-on");
    expect(vouchOn, ".bcc-btn-vouch-on rule not found").not.toBe("");
    expect(vouch, ".bcc-btn-vouch rule not found").not.toBe("");

    // Both plates are opaque now — no `transparent`, no alpha wash.
    for (const [name, body] of [
      [".bcc-btn-vouch", vouch],
      [".bcc-btn-vouch-on", vouchOn],
    ] as const) {
      const fills = fillDecls(body);
      expect(fills, `${name} should declare exactly one fill`).toHaveLength(1);
      expect(fills[0], `${name} fill must be opaque`).not.toMatch(/transparent|rgba?\([^)]*\/|\/\s*0?\.\d/);
    }

    // The bloom must therefore be edge-drawn, not a fill, or it is invisible.
    const bloom = ruleBody(CSS, ".bcc-rep-demo-bloom");
    expect(fillDecls(bloom), "bloom must declare no fill").toEqual([]);
    expect(bloom).toMatch(/border:\s*[^;]*var\(--verified\)/);
    // And it must grow past the plate, or the ring hides behind it too.
    expect(CSS).toMatch(/scale\(1\.(?:0[1-9]|1[0-9]|2)\)/);
  });
});
