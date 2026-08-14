/**
 * The verified green becomes theme-scoped, and both of its representations
 * move together.
 *
 * `#2c9d66` measured **3.43:1** on a light page background at 12px
 * `.bcc-mono`, and **3.01–3.14:1** once composited on its own 8–12% chip
 * tint. Dark theme already cleared 4.5:1 everywhere (5.52 / 5.04 / 4.72), so
 * only light moved: **`#20794e`** reads 5.38:1 on white and 4.71:1 on the
 * tint.
 *
 * ## Why one green still serves every job
 *
 * The audit expected text and background to conflict. They do not.
 * `--bcc-text-inverse` flips with the theme, so in light BOTH "green text on
 * the page" and "inverse text on a green chip" want a darker green, and in
 * dark both want a lighter one. The jobs are aligned per theme, so no
 * text/indicator token split was needed — and none is introduced here.
 *
 * The two sites that broke that alignment hardcoded a light foreground on a
 * green background (`text-bcc-white`, `var(--cardstock)`). Both now read
 * `--bcc-text-inverse`, which is what made the single-token answer hold.
 *
 * ## The cascade hazard this file exists to pin
 *
 * `--verified-rgb` lives in the aesthetic-namespace `:root`, which closes
 * AFTER the `[data-theme="light"]` and dark blocks near the top of the file.
 * Equal specificity, later wins — so a dark value placed in those upper
 * blocks is silently clobbered. The dark overrides therefore sit in their own
 * paired blocks after that `:root`. If someone "tidies" them upward, dark
 * theme reverts to the light green and only this guard will say so.
 *
 * Equally: the hex and the triplet are two spellings of one colour. If they
 * drift, `var(--verified)` (CSS) and `text-verified` (Tailwind, via the
 * triplet) render different greens on the same screen. Asserted below in
 * both themes.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const CSS = read("src/app/globals.css");

const LIGHT_HEX = "#20794e";
const DARK_HEX = "#2c9d66";
const LIGHT_RGB = "32 121 78";
const DARK_RGB = "44 157 102";

// ─────────────────────────────────────────────────────────────────────────
// Colour maths
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
/** Composite `fg` at `alpha` over opaque `bg` — translucent tints must be
 *  flattened before they are measured, never measured as if opaque. */
const over = (fg: string, bg: string, alpha: number) => {
  const [f, b] = [chan(fg), chan(bg)];
  const mix = f.map((c, i) => Math.round(c * alpha + (b[i] ?? 0) * (1 - alpha)));
  return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
};

const decls = (name: string) =>
  [...CSS.matchAll(new RegExp(`--${name}:\\s*([^;]+);`, "g"))].map((m) => m[1]?.trim() ?? "");

const LIGHT_BG = "#ffffff";
const DARK_BG = "#0d1117";
const DARK_SURFACE = "#161b22";
const DARK_CARD = "#1c2128";

// ─────────────────────────────────────────────────────────────────────────
// 1. The scan is honest before it concludes
// ─────────────────────────────────────────────────────────────────────────

describe("verified theme scope — preconditions", () => {
  it("read a real stylesheet", () => {
    expect(CSS.length).toBeGreaterThan(100_000);
    expect(CSS).toContain("@tailwind");
  });

  it("the surface tokens this file measures against are the real ones", () => {
    expect(decls("bcc-bg")).toEqual([LIGHT_BG, DARK_BG, DARK_BG]);
    expect(decls("bcc-surface")).toEqual([LIGHT_BG, DARK_SURFACE, DARK_SURFACE]);
    expect(decls("card-surface")).toEqual([LIGHT_BG, DARK_CARD, DARK_CARD]);
    expect(decls("bcc-text-inverse")).toEqual([LIGHT_BG, DARK_BG, DARK_BG]);
  });

  it("the compositor works on a known case", () => {
    expect(over("#000000", "#ffffff", 0)).toBe("#ffffff");
    expect(over("#000000", "#ffffff", 1)).toBe("#000000");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Both representations, both themes, in lockstep
// ─────────────────────────────────────────────────────────────────────────

describe("verified — the hex and the triplet cannot drift", () => {
  it("declares exactly one light value and two dark ones, per representation", () => {
    expect(decls("bcc-verified")).toEqual([LIGHT_HEX, DARK_HEX, DARK_HEX]);
    expect(decls("verified-rgb")).toEqual([LIGHT_RGB, DARK_RGB, DARK_RGB]);
  });

  it("the triplet is channel-exact against the hex in BOTH themes", () => {
    expect(chan(LIGHT_HEX).join(" ")).toBe(LIGHT_RGB);
    expect(chan(DARK_HEX).join(" ")).toBe(DARK_RGB);
  });

  it("the alias still derives from the brand token, so it needs no scoping", () => {
    expect(CSS).toContain("--verified:        var(--bcc-verified);");
  });

  it("Tailwind reads the triplet with an alpha channel, not a bare var", () => {
    // A bare `var(--x)` theme entry emits NO rule for `/opacity` modifiers.
    const tw = read("tailwind.config.ts");
    expect(tw).toContain("verified: \"rgb(var(--verified-rgb) / <alpha-value>)\"");
  });
});

describe("verified — the dark overrides are placed where they actually apply", () => {
  it("every dark declaration comes AFTER the aesthetic :root that holds the light triplet", () => {
    // Position, not indentation — the point is cascade order, and a
    // whitespace-sensitive assertion would fail on a reformat instead of on
    // the regression it exists to catch.
    const lightTriplet = CSS.indexOf(`--verified-rgb:    ${LIGHT_RGB};`);
    expect(lightTriplet, "light triplet not found").toBeGreaterThan(-1);

    const darkPositions = [
      ...[...CSS.matchAll(new RegExp(`--bcc-verified:\\s*${DARK_HEX};`, "g"))],
      ...[...CSS.matchAll(new RegExp(`--verified-rgb:\\s*${DARK_RGB};`, "g"))],
    ].map((m) => m.index ?? -1);

    expect(darkPositions).toHaveLength(4); // 2 representations x 2 dark blocks
    for (const pos of darkPositions) {
      expect(pos, "a dark value sits before the aesthetic :root and will be clobbered")
        .toBeGreaterThan(lightTriplet);
    }
  });

  it("each dark block carries BOTH representations, never just one", () => {
    for (const block of [
      /@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\}\s*\}/g,
      /\[data-theme="dark"\] \{([\s\S]*?)\}/g,
    ]) {
      const hits = [...CSS.matchAll(block)]
        .map((m) => m[1] ?? "")
        .filter((b) => b.includes("--bcc-verified") || b.includes("--verified-rgb"));
      expect(hits.length, "no dark block declares the verified green").toBeGreaterThan(0);
      for (const body of hits) {
        expect(body).toContain(`--bcc-verified:  ${DARK_HEX};`);
        expect(body).toContain(`--verified-rgb:  ${DARK_RGB};`);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Contrast, both themes, across every job
// ─────────────────────────────────────────────────────────────────────────

describe("verified as readable text — 4.5:1 at 12px .bcc-mono", () => {
  it("light theme clears on every theme-aware surface", () => {
    expect(ratio(LIGHT_HEX, LIGHT_BG)).toBeGreaterThanOrEqual(4.5);
  });

  it("dark theme still clears on page, surface and card", () => {
    for (const bg of [DARK_BG, DARK_SURFACE, DARK_CARD]) {
      expect(ratio(DARK_HEX, bg), `failed on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("clears on its OWN chip tint, composited — the 8/10/12% fills in use", () => {
    for (const a of [0.08, 0.1, 0.12]) {
      expect(ratio(LIGHT_HEX, over(LIGHT_HEX, LIGHT_BG, a)), `light ${a}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(DARK_HEX, over(DARK_HEX, DARK_BG, a)), `dark ${a}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the chip text is normal-size, which is why 3:1 is not the bar", () => {
    expect(CSS).toMatch(/\.bcc-mono\s*\{[^}]*font-size:\s*12px/);
  });
});

describe("verified as a solid background — inverse text on top", () => {
  it("clears 4.5:1 in both themes", () => {
    expect(ratio(LIGHT_BG, LIGHT_HEX)).toBeGreaterThanOrEqual(4.5); // #fff on light green
    expect(ratio(DARK_BG, DARK_HEX)).toBeGreaterThanOrEqual(4.5); // #0d1117 on dark green
  });

  it("no verified background hardcodes a light foreground any more", () => {
    // These two were the ONLY sites where the foreground did not flip with
    // the theme; they are what would have forced a token split.
    const rep = read("src/components/profile/ReputationSummaryPanel.tsx");
    expect(rep).toContain("bg-verified");
    expect(rep).not.toContain("bg-verified px-2 py-[3px] text-bcc-white");
    expect(rep).toContain("text-[var(--bcc-text-inverse)]");

    // Scoped to the VERIFIED chip. This file also paints a --blueprint
    // background with cardstock text, which is a different colour pair and
    // deliberately out of scope.
    const stance = read("src/components/onchain/CollectionStancePanel.tsx");
    expect(stance).toContain(
      'background: "var(--verified)", color: "var(--bcc-text-inverse)"',
    );
    expect(stance).not.toContain(
      'background: "var(--verified)", color: "var(--cardstock)"',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. The decorative-border ruling, enumerated so it cannot spread
// ─────────────────────────────────────────────────────────────────────────

/**
 * Translucent verified borders are accepted as DECORATIVE — but only where
 * the border is accompanied by BOTH the verified tint and readable verified
 * text, so the component stays identifiable without it. Every such site is
 * named here. A new translucent verified border that becomes the only state
 * cue is NOT covered by this ruling, and the count assertion below is what
 * forces it back to review.
 */
const DECORATIVE_BORDER_SITES: ReadonlyArray<readonly [string, string]> = [
  ["src/app/(main)/(app)/halls/page.tsx", "0.32"],
  ["src/components/cards/CardFrontFace.tsx", "0.32"],
  ["src/components/celebration/CelebrationToast.tsx", "0.45"],
  ["src/components/disputes/CaseHeader.tsx", "0.32"],
  ["src/components/disputes/MyDisputesList.tsx", "0.32"],
  ["src/components/groups/GroupMembershipStrip.tsx", "0.32"],
  ["src/components/identity/AuthorBadge.tsx", "0.40"],
  ["src/components/identity/AuthorVouchButton.tsx", "0.45"],
];

describe("translucent verified borders — decorative, and enumerated", () => {
  it("the ruling covers exactly the eight audited sites", () => {
    expect(DECORATIVE_BORDER_SITES).toHaveLength(8);
  });

  for (const [file, alpha] of DECORATIVE_BORDER_SITES) {
    it(`${file.split("/").pop()} pairs its border with a tint AND readable text`, () => {
      const src = read(file);
      expect(src, "border alpha changed").toContain(`rgb(var(--verified-rgb) / ${alpha})`);
      // the two companions that make the border non-load-bearing
      expect(src).toMatch(/rgb\(var\(--verified-rgb\) \/ 0\.(08|10|12)\)/);
      expect(src).toMatch(/color:\s*"?var\(--verified\)/);
    });
  }

  it("they are decorative precisely BECAUSE they cannot reach 3:1", () => {
    // Recorded, not repaired. Darkening barely moves an alpha border; the
    // component is identifiable from tint + text, so 1.4.11 is not engaged.
    // No assertion pins them below 3:1 — a guard that fails when someone
    // raises the alpha would punish an improvement.
    const border = over(LIGHT_HEX, LIGHT_BG, 0.32);
    expect(ratio(border, LIGHT_BG)).toBeGreaterThan(1); // sanity only
  });
});

describe("the load-bearing border is NOT covered by that ruling", () => {
  it(".bcc-card-pill uses full-opacity verified and clears 3:1 in both themes", () => {
    const rule = /\.bcc-card-pill\s*\{[^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(rule).toContain("border: 1.5px solid var(--pill-color, var(--bcc-accent))");
    expect(rule).not.toMatch(/border:[^;]*rgb\(var\(--verified-rgb\)/); // no alpha here
    expect(ratio(LIGHT_HEX, LIGHT_BG)).toBeGreaterThanOrEqual(3);
    expect(ratio(DARK_HEX, DARK_CARD)).toBeGreaterThanOrEqual(3);
  });

  it("the active pill flips its foreground with the theme", () => {
    const on = /\.bcc-card-pill-on\s*\{[^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(on).toContain("background: var(--pill-color, var(--bcc-accent))");
    expect(on).toContain("color: var(--bcc-text-inverse)");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Pinned exclusions
// ─────────────────────────────────────────────────────────────────────────

describe("what this slice deliberately did NOT change", () => {
  it("the three verified→phosphor gradients are untouched and deferred", () => {
    const grads = [...CSS.matchAll(/linear-gradient\(90deg, var\(--verified\), var\(--phosphor\)\)/g)];
    const tsx = [
      "src/components/profile/LivingHeader.tsx",
      "src/components/profile/StandingFileBody.tsx",
      "src/components/profile/TrustQuestsBlock.tsx",
    ].filter((f) => read(f).includes("var(--verified), var(--phosphor)"));
    expect(tsx).toHaveLength(3);
    expect(grads.length + tsx.length).toBeGreaterThanOrEqual(3);
  });

  it("phosphor, safety, weld and blueprint stay theme-blind and unchanged", () => {
    expect(decls("phosphor")).toEqual(["#7dff9a"]);
    expect(decls("phosphor-rgb")).toEqual(["125 255 154"]);
    expect(decls("bcc-safety")).toEqual(["#f05a28"]);
    expect(decls("safety-rgb")).toEqual(["240 90 40"]);
    expect(decls("bcc-weld")).toEqual(["#ffc01e"]);
    expect(decls("bcc-blueprint")).toEqual(["#0f1e3c"]);
  });

  it("no verified consumer was moved onto paper or cardstock", () => {
    // Fixed-cream surfaces do not flip with the theme, so a theme-scoped
    // green on them would be worse in dark, not better. None exists.
    expect(CSS).not.toMatch(/background:\s*var\(--(paper|cardstock)\)[^;]*;\s*color:\s*var\(--verified\)/);
    for (const f of DECORATIVE_BORDER_SITES.map(([p]) => p)) {
      expect(read(f), `${f} put verified on cream`).not.toMatch(
        /var\(--verified\)[\s\S]{0,80}var\(--cardstock\)/,
      );
    }
  });

  it("verified did NOT split into separate text and indicator tokens", () => {
    expect(CSS).not.toMatch(/--verified-text\b/);
    expect(CSS).not.toMatch(/--verified-indicator\b/);
    expect(CSS).not.toMatch(/--bcc-verified-text\b/);
  });
});
