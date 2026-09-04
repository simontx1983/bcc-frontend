/**
 * Onboarding mobile + focus foundations, pinned at the CSS layer.
 *
 * These are style contracts that a DOM render cannot express: vitest runs
 * with `css: false`, so no test in this repo has computed styles. Each
 * guard below therefore reads the real source — and each carries a
 * MUTATION CONTROL proving the assertion fails against the pre-fix text,
 * which is the house pattern (see rep-demo-bloom-layering.test.ts §4).
 *
 * The geometry these encode was measured in a real browser at 320–768px
 * before the change; the numbers are not guesses.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

const CSS = read("src/app/globals.css");
const FIRST_PULLS = read("src/components/onboarding/FirstPullsStep.tsx");

/**
 * Body of a top-level rule, by exact selector, with comments stripped.
 *
 * Stripping matters: several of these rules explain themselves in prose
 * that names the very tokens being asserted ("100vh then 100dvh — …"), so
 * a guard reading the raw body would match the comment and pass whether or
 * not the declaration survived.
 */
function ruleBody(css: string, selector: string): string {
  const i = css.indexOf(`\n${selector} {`);
  if (i === -1) return "";
  const start = css.indexOf("{", i);
  return css.slice(start, css.indexOf("}", start)).replace(/\/\*[\s\S]*?\*\//g, "");
}

// ─────────────────────────────────────────────────────────────────────
// Tap targets. Measured before the change: .bcc-onb-link was 27px tall —
// clear of the WCAG 2.5.8 AA floor (24px) but under this project's 36px
// sanctioned compact minimum, on the Back and Skip controls specifically.
// ─────────────────────────────────────────────────────────────────────

describe("tap targets meet the project's compact minimum", () => {
  for (const sel of [".bcc-onb-link", ".bcc-onb-chip", ".bcc-onb-mini-btn"]) {
    it(`${sel} declares min-height: 36px`, () => {
      expect(ruleBody(CSS, sel)).toMatch(/min-height:\s*36px/);
    });
  }

  it("MUTATION CONTROL — the guard fails without the declaration", () => {
    const mutated = CSS.replace("min-height: 36px; display: inline-flex", "display: inline-flex");
    expect(ruleBody(mutated, ".bcc-onb-link")).not.toMatch(/min-height:\s*36px/);
  });

  it("keeps the primary action at or above 44px worth of padding", () => {
    // 0.9rem text + 10px/24px padding measured at 45px tall.
    expect(CSS).toMatch(/--bcc-display-btn-pad-md:\s*10px 24px/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Viewport height. `vh` ignores mobile browser chrome and the software
// keyboard, so a focused field could sit under the fixed auth footer.
// ─────────────────────────────────────────────────────────────────────

describe("viewport height uses dvh with a vh fallback", () => {
  for (const sel of [".bcc-onb-root", ".bcc-minimal-shell"]) {
    it(`${sel} declares both, fallback first`, () => {
      const body = ruleBody(CSS, sel);
      expect(body).toMatch(/min-height:\s*100vh/);
      expect(body).toMatch(/min-height:\s*100dvh/);
      expect(body.indexOf("100vh")).toBeLessThan(body.indexOf("100dvh"));
    });
  }

  it("MUTATION CONTROL — fails when only vh is declared", () => {
    // Mutate the rule BODY, not the raw file: globals.css is CRLF, so a
    // multi-line literal replace silently no-ops and the control would
    // pass without proving anything.
    const body = ruleBody(CSS, ".bcc-onb-root");
    const mutated = body.replace(/\s*min-height:\s*100dvh;/, "");
    expect(mutated).not.toMatch(/100dvh/);
    expect(mutated).not.toBe(body);
    expect(mutated).toMatch(/min-height:\s*100vh/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Focus. `.bcc-auth-input` is every login / signup / OTP / password field.
// Its `outline: none` tied the global :focus-visible rule on specificity
// and won on order, leaving only a 3px 8%-alpha glow.
// ─────────────────────────────────────────────────────────────────────

describe("auth inputs have a visible keyboard focus indicator", () => {
  const FOCUS = /\.bcc-auth-input:focus-visible\s*\{[^}]*outline:\s*2px solid var\(--bcc-focus-ring\)/;

  it("restores the global focus ring token", () => {
    expect(CSS).toMatch(FOCUS);
  });

  it("uses the shared token rather than a bespoke colour", () => {
    const body = ruleBody(CSS, ".bcc-auth-input:focus-visible");
    expect(body).toContain("var(--bcc-focus-ring)");
    expect(body).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(body).not.toMatch(/\brgb\(|\bhsl\(/);
  });

  it("keeps the token defined once per accent, never per theme", () => {
    const decls = [...CSS.matchAll(/--bcc-focus-ring:\s*([^;]+);/g)].map((m) => m[1]?.trim());
    expect(decls).toEqual(["#1081a3", "#b95e05"]);
  });

  it("MUTATION CONTROL — fails without the rule", () => {
    const mutated = CSS.replace(FOCUS, ".bcc-auth-input:focus-visible { outline: none");
    expect(mutated).not.toMatch(FOCUS);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The undeclared token. Nine auth rules referenced --bcc-text-primary,
// which is declared nowhere — an undefined custom property on an
// inherited property resolves to `inherit`, so they silently rendered in
// body colour and were invisible to every colour guard.
// ─────────────────────────────────────────────────────────────────────

describe("no undeclared custom properties in the auth surface", () => {
  it("references --bcc-text-primary nowhere", () => {
    expect(CSS).not.toContain("--bcc-text-primary");
  });

  it("uses the declared --bcc-text token instead", () => {
    expect(CSS).toMatch(/--bcc-text:\s*#/);
    expect(ruleBody(CSS, ".bcc-auth-heading")).toContain("var(--bcc-text)");
  });

  /**
   * The nine repaired references, pinned by name. The GENERAL invariant —
   * every `var(--bcc-*)` resolving to a declared property, in stylesheets
   * as well as components — lives in undeclared-custom-property.test.ts,
   * whose detector correctly allows the legitimate `var(--x, fallback)`
   * form that a naive regex here would mis-flag. That test's
   * `--bcc-text-primary` exemption was REMOVED as part of this slice, so
   * the whole class is now guarded there with no exemptions at all.
   */
  it("the repaired auth/onboarding rules all use the declared --bcc-text", () => {
    for (const sel of [
      ".bcc-auth-heading",
      ".bcc-auth-input",
      ".bcc-auth-success-title",
      ".bcc-auth-submit--outline",
      ".bcc-signout-title",
    ]) {
      expect(ruleBody(CSS, sel), sel).toContain("var(--bcc-text)");
    }
  });

  it("MUTATION CONTROL — fails if the undeclared name comes back", () => {
    const mutated = CSS.replace("color: var(--bcc-text);", "color: var(--bcc-text-primary);");
    expect(mutated).not.toBe(CSS);
    expect(mutated).toContain("--bcc-text-primary");
  });
});

// ─────────────────────────────────────────────────────────────────────
// Focus-ring CONTRAST, computed from the real tokens rather than eyeballed.
//
// WCAG 1.4.11 asks for 3:1 on a non-text UI indicator against ADJACENT
// colours. The ring is drawn with `outline-offset: 2px`, so the colour it
// sits against is the surface behind the input, in both themes and under
// both accents. This mirrors focus-indicator-token.test.ts's method.
// ─────────────────────────────────────────────────────────────────────

describe("the restored auth focus ring is actually visible", () => {
  const hex = (h: string) => {
    const v = h.replace("#", "");
    return [0, 2, 4].map((i) => Number.parseInt(v.slice(i, i + 2), 16) / 255);
  };
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const lum = (h: string) => {
    const [r = 0, g = 0, b = 0] = hex(h).map(lin);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a: string, b: string) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
    return (x + 0.05) / (y + 0.05);
  };

  /** Read a token's value from a specific declaring block. */
  function tokenIn(block: string, name: string): string {
    const m = new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(block);
    return m?.[1] ?? "";
  }

  const RINGS = [...CSS.matchAll(/--bcc-focus-ring:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1] ?? "");

  it("reads two real ring colours and two real surfaces", () => {
    expect(RINGS).toHaveLength(2);
    // Light and dark --bcc-surface, in declaration order.
    const surfaces = [...CSS.matchAll(/--bcc-surface:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1] ?? "");
    expect(surfaces.length).toBeGreaterThanOrEqual(2);
  });

  it("clears 3:1 against every declared --bcc-surface, in both accents", () => {
    const surfaces = [
      ...new Set([...CSS.matchAll(/--bcc-surface:\s*(#[0-9a-fA-F]{6})/g)].map((m) => m[1] ?? "")),
    ];
    const failures: string[] = [];
    for (const ring of RINGS) {
      for (const surface of surfaces) {
        const r = ratio(ring, surface);
        if (r < 3) failures.push(`${ring} on ${surface} = ${r.toFixed(2)}:1`);
      }
    }
    expect(failures, `focus ring under 3:1 — ${failures.join("; ")}`).toEqual([]);
  });

  it("the glow it replaced could not have passed — that is why this exists", () => {
    // The old :focus rule's ONLY indicator was a 3px
    // `--bcc-accent-subtle` box-shadow. That token aliases the per-accent
    // *-subtle values, both of which are 8% alpha — a tint that composites
    // to within a few percent of the surface it sits on, which is why the
    // ring was described as "effectively invisible" rather than merely low
    // contrast. Asserted through the alias so a future re-point is caught.
    expect(CSS).toMatch(/--bcc-accent-subtle:\s*var\(--bcc-(primary|secondary)-subtle\)/);
    const alphas = [...CSS.matchAll(/--bcc-(?:primary|secondary)-subtle:\s*rgba\([^)]*?,\s*([\d.]+)\s*\)/g)]
      .map((m) => Number.parseFloat(m[1] ?? "1"));
    expect(alphas.length).toBeGreaterThanOrEqual(2);
    for (const a of alphas) expect(a).toBeLessThanOrEqual(0.1);
  });

  it("keeps the ring unclipped — no overflow:hidden on the input itself", () => {
    expect(ruleBody(CSS, ".bcc-auth-input")).not.toMatch(/overflow:\s*hidden/);
    expect(tokenIn(ruleBody(CSS, ".bcc-auth-input:focus-visible"), "outline-offset")).toBe("");
    expect(ruleBody(CSS, ".bcc-auth-input:focus-visible")).toMatch(/outline-offset:\s*2px/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// Overflow prevention (not concealment). `.bcc-onb-root` sets
// `overflow-x: hidden`, which only HIDES overflow — a long unbroken word
// or a ~30%-longer translated string would be clipped, silently.
// ─────────────────────────────────────────────────────────────────────

describe("long text wraps rather than being clipped", () => {
  it("display type can break anywhere and may shrink below its content", () => {
    const body = ruleBody(CSS, ".bcc-onb-disp");
    expect(body).toMatch(/overflow-wrap:\s*anywhere/);
    expect(body).toMatch(/min-width:\s*0/);
  });

  it("MUTATION CONTROL — fails without the wrap declaration", () => {
    const mutated = CSS.replace("overflow-wrap: anywhere; min-width: 0; }", "}");
    expect(ruleBody(mutated, ".bcc-onb-disp")).not.toMatch(/overflow-wrap:\s*anywhere/);
  });
});

// ─────────────────────────────────────────────────────────────────────
// The zero-width card collapse. MEASURED in a real browser: at 375px —
// the documented primary target — every suggestion card computed to
// 0 × 0 and the whole grid occupied no space at all.
//
// Chain: below 380px `.bcc-card` becomes `width: 100%`, its parent
// `.bcc-card-stage` sets only `perspective`, the wrapper is a
// shrink-to-fit flex column, and `.bcc-card-face` is `position: absolute`
// so it contributes no intrinsic width. The percentage had no basis.
// ─────────────────────────────────────────────────────────────────────

describe("suggestion cards have a width to resolve against", () => {
  // BOTH declarations are required. Verified empirically in a browser at
  // 375px: with only the wrapper width the card still computed 0 × 0,
  // because `align-items: center` makes `.bcc-card-stage` shrink-to-fit.
  const WRAPPER_WIDTH = /width:\s*"min\(316px, 100%\)"/;
  const ANCESTOR_WIDTH = /<div style=\{\{ width: "100%" \}\}>/;

  it("the card wrapper declares a definite width", () => {
    expect(FIRST_PULLS).toMatch(WRAPPER_WIDTH);
  });

  it("the card's block-level ancestor declares width: 100%", () => {
    expect(FIRST_PULLS).toMatch(ANCESTOR_WIDTH);
  });

  it("the ancestor wraps CardFactory, not something else", () => {
    expect(FIRST_PULLS).toMatch(
      /<div style=\{\{ width: "100%" \}\}>\s*<CardFactory/,
    );
  });

  it("the narrow-viewport rule that makes both necessary is still in place", () => {
    // If this stops being a percentage the two widths are no longer
    // load-bearing — revisit this test then, don't delete it.
    expect(CSS).toMatch(/@media \(max-width: 380px\)[\s\S]{0,200}width:\s*100%/);
    // `.bcc-card-stage` still contributes no width of its own, which is the
    // reason the percentage had nothing to resolve against.
    expect(ruleBody(CSS, ".bcc-card-stage")).not.toMatch(/width\s*:/);
  });

  it("MUTATION CONTROL — removing EITHER sizing rule fails the guard", () => {
    const withoutWrapper = FIRST_PULLS.replace(', width: "min(316px, 100%)"', "");
    expect(withoutWrapper).not.toBe(FIRST_PULLS);
    expect(withoutWrapper).not.toMatch(WRAPPER_WIDTH);

    const withoutAncestor = FIRST_PULLS.replace('<div style={{ width: "100%" }}>', "<div>");
    expect(withoutAncestor).not.toBe(FIRST_PULLS);
    expect(withoutAncestor).not.toMatch(ANCESTOR_WIDTH);
  });

  it("is scoped to onboarding — CommunityJoinCard is untouched by this branch", () => {
    // Same centered-flex pattern, same latent defect, deliberately NOT
    // fixed here (out of Part 1's scope). Recorded, not swept in.
    const JOIN_CARD = read("src/components/communities/CommunityJoinCard.tsx");
    expect(JOIN_CARD).not.toMatch(WRAPPER_WIDTH);
  });
});
