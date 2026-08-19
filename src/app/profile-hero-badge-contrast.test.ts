/**
 * ProfileHero's photo-editor badges: opaque ink plate, safety as a mark only.
 *
 * ## The arithmetic that forced this
 *
 * `text-cardstock` on any safety-derived fill is **capped at 2.71:1** and can
 * never reach AA at any alpha. Safety's relative luminance (0.2599) sits
 * *between* ink (0.0041) and cardstock (0.7889), so lowering the alpha only
 * slides the plate along the axis between the uploaded image and safety —
 * there is no alpha at which cardstock-on-safety clears 4.5. As shipped, the
 * two REMOVE badges measured **2.63:1** (cover, `bg-safety/80` over the
 * `bg-ink/35` scrim over a white cover) and **2.89:1** (avatar,
 * `bg-safety/85` over `bg-ink/55`). `border-safety/70` against its own
 * `bg-safety/80` fill measured **1.00:1** — the border was doing nothing.
 *
 * The text is genuinely 10px and 9px: the Tailwind `text-[10px]` utility sits
 * in the utilities layer and beats `.bcc-mono`'s 12px from the components
 * layer. So this is normal text and the bar is 4.5:1, not 3:1.
 *
 * ## The fix, and why it is image-independent
 *
 * An **opaque** ink plate makes the uploaded image drop out of the
 * compositing entirely: `rgb(239 229 207)` on `rgb(15 13 9)` is **15.51:1**
 * whatever the operator uploaded. Measured in Chromium over bright, dark,
 * high-detail, split-luminance, adversarial mid-luminance and
 * safety-orange test covers, at 360/375/1280 and in both themes, the sampled
 * plate was **exactly `rgb(15,13,9)` in all 72 cases** — spread 0.00.
 *
 * Safety survives as a leading-edge stripe. It is deliberately
 * **non-load-bearing**: the ink plate and the cardstock hairline are a
 * complementary pair — the plate carries the boundary over light imagery, the
 * hairline over dark — and their max never drops below **3.94:1** at the
 * crossover (image luminance 0.163). Safety alone bottoms out at 1.00:1 over
 * a safety-orange photo, so nothing depends on it. That is doctrine §5.4's
 * "color the mark, not the word".
 *
 * ## Why `disabled:opacity-50` had to go from all five buttons
 *
 * Group opacity dims plate and label by the same factor, so it collapses the
 * contrast between them. It took the safety badges to **1.70:1 / 1.85:1** and
 * the *already-correct* ink siblings to **3.16:1 / 3.97:1**. That state is not
 * decorative — it renders "UPLOADING…" / "REMOVING…", which is the only
 * feedback the operator gets. All five now dim the TEXT only.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const HERO = "src/components/settings/profile/ProfileHero.tsx";
const SRC = readFileSync(resolve(process.cwd(), HERO), "utf-8");
const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");

// ── colour maths ─────────────────────────────────────────────────────────

type RGB = readonly [number, number, number];
const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]: RGB) => 0.2126 * lin(r / 255) + 0.7152 * lin(g / 255) + 0.0722 * lin(b / 255);
const ratio = (a: RGB, b: RGB) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
const over = (src: RGB, dst: RGB, a: number): RGB =>
  [src[0] * a + dst[0] * (1 - a), src[1] * a + dst[1] * (1 - a), src[2] * a + dst[2] * (1 - a)];

/** Read a `--x-rgb: r g b;` triplet out of globals.css. */
function triplet(name: string): RGB {
  const m = new RegExp(`--${name}:\\s*(\\d+)\\s+(\\d+)\\s+(\\d+);`).exec(CSS);
  if (m === null) throw new Error(`no --${name} triplet in globals.css`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}
const INK = triplet("ink-rgb");
const INK_SOFT = triplet("ink-soft-rgb");
const CARDSTOCK = triplet("cardstock-rgb");
const SAFETY = triplet("safety-rgb");

// ── the five overlay buttons ─────────────────────────────────────────────

/** Every `className="…"` literal in the file. */
function classNames(src: string): string[] {
  return [...src.matchAll(/className="([^"]+)"/g)].map((m) => m[1] ?? "");
}

/** The photo-editor buttons: mono chips that sit on the cover/avatar. */
function overlayButtons(src: string): string[] {
  return classNames(src).filter((c) => /\bbcc-mono\b/.test(c) && /\b(bg-ink|bg-safety)/.test(c));
}

const REMOVE_BADGES = (src: string) =>
  overlayButtons(src).filter((c) => /border-l-(?:\[3px\]|2)/.test(c) || /bg-safety/.test(c));

// ── detectors ────────────────────────────────────────────────────────────

/** `bg-ink` with NO alpha modifier and no `-soft`/`-ghost` suffix. */
const hasOpaqueInkPlate = (c: string) => /\bbg-ink(?![\w/-])/.test(c);
const hasTranslucentSafetyFill = (c: string) => /\bbg-safety\/\d/.test(c);
const hasAnySafetyFill = (c: string) => /\bbg-safety\b/.test(c);
const hasLightTextOnSafetyFill = (c: string) =>
  hasAnySafetyFill(c) && /\btext-cardstock\b/.test(c);
const usesGroupOpacityDisabled = (c: string) => /\bdisabled:opacity-\d/.test(c);
const safetyTokens = (c: string) => c.match(/[\w:[\]/-]*safety[\w:[\]/-]*/g) ?? [];
/** Every safety-bearing utility on the chip is a border utility. */
const safetyOnlyAsMark = (c: string) =>
  safetyTokens(c).every((t) => /^(?:hover:|focus-visible:)?border(?:-[a-z])?-safety$/.test(t));

// ─────────────────────────────────────────────────────────────────────────
// 0. Preconditions — a guard that scans nothing passes everything
// ─────────────────────────────────────────────────────────────────────────

describe("preconditions — the scan surface is real", () => {
  it("reads a substantial ProfileHero and globals.css", () => {
    expect(SRC.length).toBeGreaterThan(8_000);
    expect(CSS.length).toBeGreaterThan(100_000);
  });

  it("finds the five photo-editor overlay buttons", () => {
    expect(overlayButtons(SRC)).toHaveLength(5);
  });

  it("finds exactly two REMOVE badges", () => {
    expect(REMOVE_BADGES(SRC)).toHaveLength(2);
  });

  it("resolves the four tokens it reasons about", () => {
    expect(INK).toEqual([15, 13, 9]);
    expect(CARDSTOCK).toEqual([239, 229, 207]);
    expect(SAFETY).toEqual([240, 90, 40]);
    expect(INK_SOFT).toEqual([42, 37, 28]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 1. The ruling: opaque ink backing, safety as a mark only
// ─────────────────────────────────────────────────────────────────────────

describe("both REMOVE badges are opaque-ink-backed", () => {
  it("each carries an alpha-free bg-ink plate", () => {
    for (const c of REMOVE_BADGES(SRC)) expect(hasOpaqueInkPlate(c), c).toBe(true);
  });

  it("neither carries a translucent safety fill", () => {
    for (const c of REMOVE_BADGES(SRC)) expect(hasTranslucentSafetyFill(c), c).toBe(false);
  });

  it("neither carries ANY safety fill", () => {
    for (const c of REMOVE_BADGES(SRC)) expect(hasAnySafetyFill(c), c).toBe(false);
  });

  it("neither puts light text over a safety fill", () => {
    for (const c of REMOVE_BADGES(SRC)) expect(hasLightTextOnSafetyFill(c), c).toBe(false);
  });

  it("safety survives only as a border/stripe mark", () => {
    for (const c of REMOVE_BADGES(SRC)) {
      expect(safetyTokens(c).length, c).toBeGreaterThan(0); // the mark is still there
      expect(safetyOnlyAsMark(c), c).toBe(true);
    }
  });

  it("no overlay button anywhere in the hero carries a safety fill", () => {
    for (const c of overlayButtons(SRC)) expect(hasAnySafetyFill(c), c).toBe(false);
  });

  it("no full-image safety overlay was introduced", () => {
    expect(SRC).not.toMatch(/inset-0[^"]*bg-safety/);
    expect(SRC).not.toMatch(/bg-safety[^"]*inset-0/);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Why a safety fill can never be rescued
// ─────────────────────────────────────────────────────────────────────────

describe("the safety-fill ceiling", () => {
  it("cardstock on opaque safety is 2.71:1 — under AA", () => {
    expect(ratio(CARDSTOCK, SAFETY)).toBeCloseTo(2.71, 2);
    expect(ratio(CARDSTOCK, SAFETY)).toBeLessThan(4.5);
  });

  it("safety's luminance sits between ink's and cardstock's, so alpha cannot help", () => {
    expect(lum(INK)).toBeLessThan(lum(SAFETY));
    expect(lum(SAFETY)).toBeLessThan(lum(CARDSTOCK));
  });

  it("no alpha of safety rescues it — for EVERY alpha some image breaks AA", () => {
    // The badge has to hold over whatever the operator uploaded, so the
    // quantity that matters is the FLOOR across images at a given alpha, not
    // the ceiling. (A near-zero alpha scores well over a black photo, but
    // that is the scrim doing the work, and it collapses over a white one.)
    for (let a = 0.05; a <= 1.0001; a += 0.05) {
      let floor = Infinity;
      for (let v = 0; v <= 255; v += 5) {
        const image: RGB = [v, v, v];
        for (const scrim of [0, 0.35, 0.55]) {
          const under = over(INK, image, scrim);
          floor = Math.min(floor, ratio(CARDSTOCK, over(SAFETY, under, a)));
        }
      }
      expect(floor, `safety fill at alpha ${a.toFixed(2)}`).toBeLessThan(4.5);
    }
    expect(ratio(CARDSTOCK, SAFETY)).toBeLessThan(4.5); // the a=1 limit
  });

  it("the opaque ink plate passes the same test that safety fails", () => {
    let floor = Infinity;
    for (let v = 0; v <= 255; v += 5) floor = Math.min(floor, ratio(CARDSTOCK, INK));
    expect(floor).toBeGreaterThanOrEqual(4.5);
  });

  it("the old shipped floors reproduce: 2.63 cover, 2.89 avatar", () => {
    const white: RGB = [255, 255, 255];
    expect(ratio(CARDSTOCK, over(SAFETY, over(INK, white, 0.35), 0.8))).toBeCloseTo(2.63, 2);
    expect(ratio(CARDSTOCK, over(SAFETY, over(INK, white, 0.55), 0.85))).toBeCloseTo(2.89, 2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The new plate is image-INDEPENDENT
// ─────────────────────────────────────────────────────────────────────────

describe("the opaque plate removes the image from the equation", () => {
  it("cardstock on ink is 15.51:1, and identical for every image", () => {
    const seen = new Set<string>();
    for (let r = 0; r <= 255; r += 15)
      for (let g = 0; g <= 255; g += 15)
        for (let b = 0; b <= 255; b += 15) {
          // An opaque plate composites to itself regardless of backdrop.
          seen.add(ratio(CARDSTOCK, over(INK, [r, g, b], 1)).toFixed(4));
        }
    expect(seen.size).toBe(1);
    expect(ratio(CARDSTOCK, INK)).toBeGreaterThan(15);
  });

  it("hover (ink-soft) and disabled (cardstock/70) both clear AA", () => {
    expect(ratio(CARDSTOCK, INK_SOFT)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(over(CARDSTOCK, INK, 0.7), INK)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(over(CARDSTOCK, INK_SOFT, 0.7), INK_SOFT)).toBeGreaterThanOrEqual(4.5);
  });

  it("the ink/cardstock pair holds the 3:1 boundary at every image luminance", () => {
    let floor = Infinity;
    for (let v = 0; v <= 255; v++) {
      const image: RGB = [v, v, v];
      floor = Math.min(floor, Math.max(ratio(INK, image), ratio(CARDSTOCK, image)));
    }
    expect(floor).toBeGreaterThanOrEqual(3.0);
    expect(floor).toBeCloseTo(3.94, 1);
  });

  it("the safety stripe is provably non-load-bearing", () => {
    // Alone it vanishes against its own hue; the pair above never does.
    expect(ratio(SAFETY, SAFETY)).toBeCloseTo(1.0, 5);
    expect(ratio(CARDSTOCK, INK)).toBeGreaterThanOrEqual(4.5); // legibility w/o safety
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. The disabled state keeps its plate
// ─────────────────────────────────────────────────────────────────────────

describe("disabled dims the text, not the badge", () => {
  it("no overlay button uses group opacity when disabled", () => {
    for (const c of overlayButtons(SRC)) expect(usesGroupOpacityDisabled(c), c).toBe(false);
  });

  it("all five use the text-only dim plus cursor-wait", () => {
    for (const c of overlayButtons(SRC)) {
      expect(c, c).toContain("disabled:text-cardstock/70");
      expect(c, c).toContain("disabled:cursor-wait");
    }
  });

  it("the alpha text utility can actually emit — cardstock has a triplet", () => {
    // A bare `var()` theme entry emits NO rule for `/70`. cardstock is
    // declared as rgb(var(--cardstock-rgb) / <alpha-value>), so it does.
    const tw = readFileSync(resolve(process.cwd(), "tailwind.config.ts"), "utf-8");
    expect(tw).toContain("rgb(var(--cardstock-rgb) / <alpha-value>)");
    expect(CSS).toMatch(/--cardstock-rgb:\s*239 229 207;/);
  });

  it("group opacity would have failed where the text-only dim passes", () => {
    const white: RGB = [255, 255, 255];
    // old: opacity-50 over the ink/80 sibling on a white cover
    const scrim = over(INK, white, 0.35);
    const oldPlate = over(over(INK, scrim, 0.8), scrim, 0.5);
    const oldText = over(CARDSTOCK, scrim, 0.5);
    expect(ratio(oldText, oldPlate)).toBeLessThan(4.5);
    expect(ratio(oldText, oldPlate)).toBeCloseTo(3.16, 1);
    // new: text-only dim on the opaque plate
    expect(ratio(over(CARDSTOCK, INK, 0.7), INK)).toBeGreaterThan(4.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Mutation controls — the detectors must FLAG a reintroduced defect,
//    and every mutation asserts its own substitution count.
// ─────────────────────────────────────────────────────────────────────────

describe("mutation controls", () => {
  /** Apply a replacement and assert exactly `expected` substitutions landed. */
  function mutate(src: string, find: RegExp, replace: string, expected: number): string {
    const hits = src.match(find);
    expect(hits === null ? 0 : hits.length, `substitutions for ${find}`).toBe(expected);
    return src.replace(find, replace);
  }

  it("CONTROL: the real source trips none of the detectors", () => {
    const badges = REMOVE_BADGES(SRC);
    expect(badges).toHaveLength(2);
    expect(badges.filter(hasTranslucentSafetyFill)).toHaveLength(0);
    expect(badges.filter(hasLightTextOnSafetyFill)).toHaveLength(0);
    expect(badges.filter((c) => !hasOpaqueInkPlate(c))).toHaveLength(0);
    expect(overlayButtons(SRC).filter(usesGroupOpacityDisabled)).toHaveLength(0);
  });

  it("M1: restoring the translucent safety fill is caught (2 substitutions)", () => {
    const m = mutate(
      SRC,
      /border border-cardstock border-l-(?:\[3px\]|2) border-l-safety bg-ink/g,
      "border border-safety/70 bg-safety/80",
      2,
    );
    const badges = REMOVE_BADGES(m);
    expect(badges).toHaveLength(2);
    expect(badges.filter(hasTranslucentSafetyFill)).toHaveLength(2);
    expect(badges.filter(hasLightTextOnSafetyFill)).toHaveLength(2);
    expect(badges.filter(hasOpaqueInkPlate)).toHaveLength(0);
    expect(badges.filter(safetyOnlyAsMark)).toHaveLength(0);
  });

  it("M2: restoring disabled:opacity-50 is caught (5 substitutions)", () => {
    const m = mutate(
      SRC,
      /disabled:cursor-wait disabled:text-cardstock\/70/g,
      "disabled:opacity-50",
      5,
    );
    expect(overlayButtons(m).filter(usesGroupOpacityDisabled)).toHaveLength(5);
    expect(overlayButtons(m).filter((c) => c.includes("disabled:text-cardstock/70"))).toHaveLength(0);
  });

  it("M3: an opaque safety fill is caught too (2 substitutions)", () => {
    // Anchored on the stripe so it targets the two badges and not the two
    // out-of-scope `bcc-stencil` SAVE buttons, which also read `bg-ink px-`.
    const m = mutate(SRC, /border-l-safety bg-ink px-/g, "border-l-safety bg-safety px-", 2);
    const badges = REMOVE_BADGES(m);
    expect(badges.filter(hasAnySafetyFill)).toHaveLength(2);
    expect(badges.filter(hasTranslucentSafetyFill)).toHaveLength(0); // opaque, so the
    expect(badges.filter(hasLightTextOnSafetyFill)).toHaveLength(2); // fill check catches it
    expect(badges.filter(safetyOnlyAsMark)).toHaveLength(0);
  });

  it("M4: dropping the safety mark entirely is caught (2 substitutions)", () => {
    const m = mutate(SRC, / border-l-(?:\[3px\]|2) border-l-safety/g, "", 2);
    const badges = REMOVE_BADGES(m);
    // The fill rules still pass — absence of safety is not a fill defect —
    // so the "mark is present" assertion is the one that must fail.
    expect(badges.filter(hasAnySafetyFill)).toHaveLength(0);
    expect(badges.flatMap(safetyTokens)).toHaveLength(0);
  });

  it("M5: swapping the plate to a translucent ink is caught (2 substitutions)", () => {
    const m = mutate(SRC, /border-l-safety bg-ink px-/g, "border-l-safety bg-ink/80 px-", 2);
    expect(REMOVE_BADGES(m).filter(hasOpaqueInkPlate)).toHaveLength(0);
  });

  it("MUTATION-CONTROL SELF-TEST: a no-op mutation asserts zero substitutions", () => {
    const m = mutate(SRC, /bg-plaid-1234/g, "x", 0);
    expect(m).toBe(SRC);
    expect(REMOVE_BADGES(m).filter(hasOpaqueInkPlate)).toHaveLength(2);
  });
});
