/**
 * Phosphor confinement — `--phosphor` is not a text colour, and after this
 * slice it has no readable-text consumers at all.
 *
 * `#7dff9a` measures **1.26:1** on a light page or panel and **1.01:1** on
 * fixed cream. It was never legible there. But it was never *supposed* to be
 * text either: it is the CRT "live" green, and its meaning is carried by its
 * brightness.
 *
 * ## Why phosphor was NOT theme-scoped, unlike verified
 *
 * A light-theme-compliant phosphor needs luminance ≤ 0.1833. Phosphor sits at
 * 0.7821 — **4.3× too bright**. Every compliant value lands in the
 * `#15803d`–`#20794e` band, which is already occupied by `--bcc-success`
 * (`#15803d` light) and `--bcc-verified` (`#20794e` light): ratio ~1.0–1.1
 * from both, i.e. visually identical. Darkening phosphor would not dim the
 * signal, it would delete it, and merge three distinct semantics into one
 * green.
 *
 * So the token keeps its value and loses its wrong jobs instead. Each former
 * consumer moved to the token that actually owned its meaning:
 *
 *   EARLY READ, reliability achievements, cast attestations  -> verified
 *   reliability trend "improving"                            -> success
 *   social-comparison headline                               -> primary text
 *   next-rung labels                                         -> secondary
 *   the "N OF M" conviction border                           -> bcc-text
 *
 * ## What phosphor is still allowed to do
 *
 * Fixed-dark indicator and decorative work only: the three progress-bar
 * gradients and their glows, which sit on `--concrete-hi` (`#1d1913`) and
 * read **13.86:1** in either theme because that track does not flip. Those
 * are asserted present and unchanged below — this slice must not touch them.
 *
 * ## The operator indicator got a structural fix, not a colour swap
 *
 * The avatar's corner dot was the ONLY place on the product where meaning
 * rode on hue alone, and it measured 1.01:1 against its own cardstock ring. A
 * colour swap could not fix it: the ring is theme-blind cream while the
 * semantic greens are theme-scoped, so verified clears 3:1 in light (4.30)
 * and fails in dark (2.74). It is now the shared `OperatorMark` glyph on a
 * fixed ink-on-cardstock plate — **15.51:1**, identical in both themes.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");
const SELF = "phosphor-confinement.test.ts";
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const CSS = read("src/app/globals.css");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|css)$/.test(e.name) && e.name !== SELF && !/\.test\./.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Comment-stripped: a token named in prose is documentation, not a use. */
const FILES = walk(SRC).map((f) => ({
  path: f.slice(SRC.length + 1).replace(/\\/g, "/"),
  code: readFileSync(f, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!:)\/\/.*$/gm, ""),
}));

// ─────────────────────────────────────────────────────────────────────────
// Colour maths
// ─────────────────────────────────────────────────────────────────────────

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
const decls = (n: string) =>
  [...CSS.matchAll(new RegExp(`--${n}:\\s*([^;]+);`, "g"))].map((m) => m[1]?.trim() ?? "");

const PHOSPHOR = "#7dff9a";
const CONCRETE_HI = "#1d1913";
const CARDSTOCK = "#efe5cf";
const INK = "#0f0d09";

// ─────────────────────────────────────────────────────────────────────────
// 1. The scan proves itself
// ─────────────────────────────────────────────────────────────────────────

describe("phosphor confinement — preconditions", () => {
  it("walked a real, non-empty source tree", () => {
    expect(FILES.length).toBeGreaterThan(400);
    expect(FILES.some((f) => f.path === "app/globals.css")).toBe(true);
  });

  it("the matcher finds a token that IS still used", () => {
    // If this returns nothing the absence assertions below are worthless.
    const verified = FILES.filter((f) => /var\(--verified\)|text-verified/.test(f.code));
    expect(verified.length).toBeGreaterThan(0);
  });

  it("the measured token values are the real ones", () => {
    expect(decls("phosphor")).toEqual([PHOSPHOR]);
    expect(decls("phosphor-rgb")).toEqual(["125 255 154"]);
    expect(decls("concrete-hi")).toEqual([CONCRETE_HI]);
    expect(decls("cardstock")).toEqual([CARDSTOCK]);
    expect(decls("ink")).toEqual([INK]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. THE INVARIANT — zero readable-text consumers
// ─────────────────────────────────────────────────────────────────────────

describe("phosphor has no readable-text consumers", () => {
  it("no Tailwind text/border/bg/ring utility references phosphor", () => {
    const hits = FILES.filter((f) =>
      /\b(text|bg|border|ring|from|to|via|shadow|fill|stroke|outline|decoration)-phosphor\b/.test(
        f.code,
      ),
    ).map((f) => f.path);
    expect(hits, `phosphor utilities survive in: ${hits.join(", ")}`).toEqual([]);
  });

  it("no rule sets `color` to phosphor", () => {
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toMatch(/color:\s*var\(--phosphor\)/);
    expect(rules).not.toMatch(/\.bcc-phosphor-text/);
  });

  it("the dead .bcc-phosphor-dot rule is gone and its comment with it", () => {
    const rules = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(rules).not.toMatch(/\.bcc-phosphor-dot/);
    // The comment that described it must not outlive it as a ghost.
    expect(CSS).not.toMatch(/bcc-phosphor-dot — the pulsing/);
  });

  it("every surviving phosphor use is a gradient or a glow", () => {
    const uses: string[] = [];
    for (const f of FILES) {
      for (const line of f.code.split("\n")) {
        if (!/var\(--phosphor\b|--phosphor-rgb\)/.test(line)) continue;
        if (/^\s*--phosphor(-rgb)?:/.test(line)) continue; // the definitions
        uses.push(`${f.path} :: ${line.trim()}`);
      }
    }
    expect(uses.length, `unexpected count:\n${uses.join("\n")}`).toBe(6);
    for (const u of uses) {
      expect(u, `not a gradient or glow: ${u}`).toMatch(/linear-gradient|boxShadow/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The fixed-dark work phosphor is still allowed to do
// ─────────────────────────────────────────────────────────────────────────

const GRADIENT_FILES = [
  "src/components/profile/LivingHeader.tsx",
  "src/components/profile/StandingFileBody.tsx",
  "src/components/profile/TrustQuestsBlock.tsx",
];

describe("the three fixed-dark gradients are untouched", () => {
  for (const f of GRADIENT_FILES) {
    it(`${f.split("/").pop()} keeps its verified→phosphor fill, glow and dark track`, () => {
      const src = read(f);
      expect(src).toContain("linear-gradient(90deg, var(--verified), var(--phosphor))");
      expect(src).toContain("boxShadow: \"0 0 8px rgb(var(--phosphor-rgb) / 0.6)\"");
      // The track is what makes phosphor legal here: it does not flip.
      expect(src).toContain("bg-concrete-hi");
    });
  }

  it("phosphor clears 3:1 on that fixed track — in BOTH themes, because it is fixed", () => {
    expect(ratio(PHOSPHOR, CONCRETE_HI)).toBeGreaterThanOrEqual(3);
  });

  it("the gradient endpoints stay visually distinct", () => {
    // Verified light is the nearer endpoint; if a future retone collapses
    // them the ramp reads as a flat bar.
    const verifiedLight = decls("bcc-verified")[0] ?? "";
    expect(ratio(PHOSPHOR, verifiedLight)).toBeGreaterThan(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Each consumer landed on the token that owns its meaning
// ─────────────────────────────────────────────────────────────────────────

describe("former phosphor consumers moved to owning semantics", () => {
  it("EARLY READ is a verification, not a live state", () => {
    const src = read("src/components/profile/AttestationRoster.tsx");
    expect(src).toContain('<span className="text-verified">EARLY READ</span>');
  });

  it("reliability standings keep the earned/not-earned asymmetry", () => {
    // `newly_active` is the start of the curve, not an achievement — the old
    // phosphor treatment painted all three alike and promoted it.
    const roster = read("src/components/profile/AttestationRoster.tsx");
    expect(roster).toContain('isEarnedStanding ? "text-verified" : "text-bcc-text-secondary"');
    expect(roster).toContain('=== "highly_reliable"');
    expect(roster).toContain('=== "consistent"');

    const badge = read("src/components/reliability/ReliabilityStandingBadge.tsx");
    expect(badge).toContain("border border-verified/60 px-2 py-[3px] text-verified");
    expect(badge).not.toContain("bg-verified/");
  });

  it("a completed attestation reads verified — border and label, no fill", () => {
    const src = read("src/components/profile/AttestationActionCluster.tsx");
    expect(src).toContain("border border-verified/60 text-verified hover:bg-bcc-surface-hover");
    // The hover feedback must not re-introduce a verified fill.
    expect(src).not.toMatch(/bg-verified\/\d/);
  });

  it("the conviction border follows its neutral text, with no dead alpha", () => {
    const src = read("src/components/profile/AttestationActionCluster.tsx");
    expect(src).toContain("border border-bcc-text bg-bcc-surface-hover text-bcc-text");
    // `bcc-text` is a bare var(): an alpha modifier would emit NO rule.
    // Comment-stripped — the note explaining that trap necessarily spells
    // the broken form out, and must not fail the assertion it documents.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(?<!:)\/\/.*$/gm, "");
    expect(code).not.toMatch(/border-bcc-text\/\d/);
  });

  it("the reliability trend is success, and keeps its glyph and label", () => {
    const src = read("src/components/profile/ReliabilityMirrorBody.tsx");
    expect(src).toContain('toneClass: "text-bcc-success"');
    expect(src).toContain('glyph: "↑"');
    expect(src).toContain('label: "Improving"');
  });

  it("the comparison headline is primary text, not a semantic colour", () => {
    const src = read("src/components/profile/LivingHeader.tsx");
    expect(src).toContain(
      '<p className="bcc-mono text-[11px] tracking-[0.18em] text-bcc-text">',
    );
  });

  it("next-rung labels are secondary and the arrow still separates them", () => {
    // The two files space the arrow differently (`mx-2` only in the header),
    // so match the arrow span shape rather than one exact string.
    const ARROW = /<span className="(?:mx-2 )?text-bcc-text-secondary">→<\/span>/;
    for (const f of [
      "src/components/profile/LivingHeader.tsx",
      "src/components/profile/StandingFileBody.tsx",
    ]) {
      const src = read(f);
      expect(src, `${f} lost its arrow separator`).toMatch(ARROW);
      expect(src).not.toContain("bcc-phosphor-text");
    }
    // No aspirational token was invented for "next".
    expect(CSS).not.toMatch(/--bcc-aspirational|--next-rung/);
  });

  it("the slot-holder link hover is a non-colour affordance", () => {
    const src = read("src/components/profile/SlotHoldersPicker.tsx");
    expect(src).toContain("text-bcc-text hover:underline");
    // A neutral hover colour would have collapsed into the resting state.
    expect(src).not.toContain("hover:text-bcc-text\"");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4b. No readable verified text is composited over a verified tint
// ─────────────────────────────────────────────────────────────────────────

/**
 * Every chip that renders verified as READABLE TEXT. Each keeps its border,
 * shape, padding, label and typography — and none carries a verified fill,
 * because that fill lifts the background toward the text and costs ~0.9 of
 * contrast (4.45 on `--bcc-surface`, 4.16 on `--card-surface` in dark). The
 * same text reads 5.04–5.52 on the bare surface.
 *
 * Deliberately NOT in this list, and deliberately still tinted:
 *   - `CelebrationToast` — its tinted circle is `aria-hidden` and contains an
 *     icon, not readable text. A decorative background with no verified text
 *     is out of scope.
 *   - Solid verified backgrounds carrying INVERSE text (StandingChip,
 *     CollectionStancePanel, the vote bar, the active pill) — different
 *     pairing, already measured, untouched.
 */
const VERIFIED_TEXT_CHIPS: readonly string[] = [
  "src/app/(main)/(app)/halls/page.tsx",
  "src/app/(main)/(app)/u/[handle]/page.tsx",
  "src/components/cards/CardFrontFace.tsx",
  "src/components/disputes/CaseHeader.tsx",
  "src/components/disputes/MyDisputesList.tsx",
  "src/components/groups/GroupMembershipStrip.tsx",
  "src/components/identity/AuthorBadge.tsx",
  "src/components/identity/AuthorVouchButton.tsx",
  "src/components/profile/AttestationActionCluster.tsx",
  "src/components/reliability/ReliabilityStandingBadge.tsx",
  "src/components/settings/ConnectionsSection.tsx",
];

describe("verified text is never composited over a verified tint", () => {
  it("the enumeration covers all eleven chips", () => {
    expect(VERIFIED_TEXT_CHIPS).toHaveLength(11);
    expect(new Set(VERIFIED_TEXT_CHIPS).size).toBe(11);
  });

  for (const file of VERIFIED_TEXT_CHIPS) {
    it(`${file.split("/").pop()} renders verified text with no verified fill`, () => {
      const src = read(file);
      expect(src, "no verified text here — wrong file in the list").toMatch(
        /text-verified\b|color:\s*"?var\(--verified\)/,
      );
      expect(src).not.toMatch(
        /bg-verified\/\d|background:\s*"?rgb\(var\(--verified-rgb\) \/ 0?\.\d+\)/,
      );
    });
  }

  it("the shared vouch-on button lost its fill too, and hovers neutral", () => {
    const rule = /\.bcc-btn-vouch-on\s*\{[^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(rule).toContain("color: var(--verified)");
    expect(rule).not.toMatch(/background:/);
    const hover = /\.bcc-btn-vouch-on:hover\s*\{[^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(hover).toContain("background: var(--bcc-surface-hover)");
    expect(hover).not.toMatch(/--verified-rgb/);
  });

  it("verified text clears 4.5:1 on every bare surface it can land on", () => {
    const [vLight, vDark] = [decls("bcc-verified")[0] ?? "", decls("bcc-verified")[1] ?? ""];
    expect(ratio(vLight, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    for (const dark of ["#0d1117", "#161b22", "#1c2128"]) {
      expect(ratio(vDark, dark), `failed on ${dark}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4c. Verified-tint detection, hardened
// ─────────────────────────────────────────────────────────────────────────

/**
 * The first version of this guard matched only `background: rgb(…)` and
 * `bg-verified/N`. It therefore scanned half the room: a gradient-form tint
 * — `radial-gradient(…, rgb(var(--verified-rgb) / 0.28), transparent)` — sailed
 * straight past it. That is the same failure mode this programme kept finding
 * in its own tooling, so the detector is now spelled out and self-tested.
 *
 * A "verified tint" is any BACKGROUND-ish declaration that references the
 * verified colour at alpha < 1, in any of these shapes:
 *
 *   background / background-color / background-image   (CSS, kebab)
 *   background / backgroundColor / backgroundImage     (JSX, camel)
 *   bg-verified/N                                      (Tailwind)
 *   plain rgb(var(--verified-rgb) / .N)
 *   linear-gradient(…) / radial-gradient(…) containing the above
 *   hardcoded channels (44 157 102 / 32 121 78), comma or space separated
 *
 * Full-alpha verified backgrounds are NOT tints — they are solid fills
 * carrying inverse text, and are governed separately above.
 */

/** Any spelling of the verified colour, including the hardcoded channels. */
const VERIFIED_REF =
  String.raw`--bcc-verified|--verified-rgb|--verified\b|44[ ,]+157[ ,]+102|32[ ,]+121[ ,]+78`;

/** An alpha < 1, in `rgb(x / .28)`, `rgba(…, 0.28)` or Tailwind `/28` form. */
const ALPHA = String.raw`\/\s*0?\.\d+|,\s*0?\.\d+\s*\)|\/\d{1,3}\b`;

/**
 * Reading a declaration's value needs a scanner, not one regex. Two earlier
 * drafts each scanned half the room and the fixtures below caught both:
 *
 *   1. requiring a closing quote — matched nothing in `globals.css`, where
 *      values are bare and `;`-terminated;
 *   2. stopping the value at a newline — missed
 *      `.bcc-celebration-sweep`, whose `linear-gradient(...)` spans six lines
 *      with the verified channels on line four.
 *
 * So: quoted values are read to their closing quote (JSX), bare values to
 * their `;` (CSS, newlines included).
 */
const DECL_START =
  /(?:background(?:-color|-image)?|backgroundColor|backgroundImage)\s*:\s*/g;
const TW_TINT = /\bbg-verified\/\d{1,3}\b/g;

interface TintHit {
  path: string;
  snippet: string;
}

/** Read one declaration's value starting at `i`. */
function readValue(code: string, i: number): string {
  const q = code[i];
  if (q === '"' || q === "'" || q === "`") {
    const end = code.indexOf(q, i + 1);
    return end === -1 ? code.slice(i, i + 400) : code.slice(i, end + 1);
  }
  const semi = code.indexOf(";", i);
  // Bare values run to the semicolon — across newlines, which is the whole
  // point. Bounded so a missing semicolon cannot swallow the file.
  return semi === -1 || semi - i > 800 ? code.slice(i, i + 800) : code.slice(i, semi);
}

function findVerifiedTints(path: string, code: string): TintHit[] {
  const out: TintHit[] = [];
  const vref = new RegExp(VERIFIED_REF);
  const alpha = new RegExp(ALPHA);

  for (const m of code.matchAll(TW_TINT)) {
    out.push({ path, snippet: m[0] });
  }
  for (const m of code.matchAll(DECL_START)) {
    const value = readValue(code, (m.index ?? 0) + m[0].length);
    if (!vref.test(value) || !alpha.test(value)) continue; // absent, or solid
    out.push({ path, snippet: value.replace(/\s+/g, " ").trim().slice(0, 90) });
  }
  return out;
}

describe("the tint detector itself is not scanning half the room", () => {
  const MUST_FLAG: ReadonlyArray<readonly [string, string]> = [
    ["plain rgb tint", `background: "rgb(var(--verified-rgb) / 0.12)",`],
    ["kebab css tint", `background: rgb(var(--verified-rgb) / 0.08);`],
    ["background-color", `background-color: rgb(var(--verified-rgb) / 0.10);`],
    ["background-image", `background-image: linear-gradient(90deg, rgb(var(--verified-rgb) / 0.2), transparent);`],
    ["camelCase backgroundImage", `backgroundImage: "radial-gradient(circle, rgb(var(--verified-rgb) / 0.3), transparent)",`],
    ["radial gradient", `background: radial-gradient(ellipse 70% 60% at 50% 100%, rgb(var(--verified-rgb) / 0.28), transparent);`],
    ["linear gradient", `background: linear-gradient(90deg, rgb(var(--verified-rgb) / 0.4), transparent);`],
    ["tailwind class", `className="bg-verified/10 text-verified"`],
    ["tailwind 3-digit", `className="bg-verified/5"`],
    ["hardcoded dark channels", `background: rgba(44, 157, 102, 0.15);`],
    ["hardcoded light channels", `background: rgb(32 121 78 / 0.2);`],
    [
      "MULTI-LINE gradient — the shape that slipped past the first two drafts",
      `background: linear-gradient(\n  100deg,\n  transparent 35%,\n  rgba(44, 157, 102, 0.18) 50%,\n  transparent 65%\n);`,
    ],
  ];

  for (const [label, sample] of MUST_FLAG) {
    it(`flags: ${label}`, () => {
      expect(findVerifiedTints("fixture", sample)).toHaveLength(1);
    });
  }

  const MUST_NOT_FLAG: ReadonlyArray<readonly [string, string]> = [
    ["solid verified background", `background: "var(--verified)",`],
    ["solid tailwind bg", `className="bg-verified px-2 text-[var(--bcc-text-inverse)]"`],
    ["full-alpha gradient (the progress fill)", `background: "linear-gradient(90deg, var(--verified), var(--phosphor))",`],
    ["verified TEXT, not a background", `className="text-verified"`],
    ["verified BORDER, not a background", `border: "1px solid rgb(var(--verified-rgb) / 0.32)",`],
    ["a safety tint — different token, out of scope", `background: rgb(var(--safety-rgb) / 0.08);`],
    ["a weld tint — out of scope", `background: rgb(var(--weld-rgb) / 0.10);`],
  ];

  for (const [label, sample] of MUST_NOT_FLAG) {
    it(`ignores: ${label}`, () => {
      expect(findVerifiedTints("fixture", sample)).toEqual([]);
    });
  }
});

describe("verified tints repo-wide — exactly two, both decorative", () => {
  const hits = FILES.flatMap((f) => findVerifiedTints(f.path, f.code));

  it("the scan examined a real corpus", () => {
    expect(FILES.length).toBeGreaterThan(400);
  });

  it("exactly the two approved decorative exceptions, and nothing else", () => {
    const paths = [...new Set(hits.map((h) => h.path))].sort();
    expect(paths, `unexpected verified tints:\n${hits.map((h) => `${h.path} :: ${h.snippet}`).join("\n")}`)
      .toEqual([
        "app/globals.css", // .bcc-rep-demo-bloom
        "components/celebration/CelebrationToast.tsx",
      ]);
  });

  /**
   * Two approved OWNERS, three declarations. `CelebrationToast` owns two of
   * them — the inline circle tint and its `.bcc-celebration-sweep` backdrop,
   * which lives in `globals.css`. Counting by file would have hidden that, so
   * the exceptions are pinned by owning rule.
   */
  it("globals.css holds exactly the two approved decorative rules", () => {
    const bloom = /\.bcc-rep-demo-bloom\s*\{[^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(bloom).toContain("radial-gradient");
    expect(bloom).toContain("--verified-rgb");
    expect(bloom).toContain("pointer-events: none");
    expect(bloom).toMatch(/animation:\s*bcc-rep-demo-bloom/);

    // TWO blocks, not one: the base rule and a `prefers-reduced-motion`
    // variant that swaps the sweeping band for a gentle static fade. Both
    // carry the tint, so both must be collected or the second reads as stray.
    const sweepBlocks = [
      ...CSS.matchAll(/\.bcc-celebration-sweep\s*\{[\s\S]*?\n\s*\}/g),
    ].map((m) => m[0]);
    expect(sweepBlocks).toHaveLength(2);
    const sweep = sweepBlocks.join("\n");
    expect(sweep).toContain("pointer-events: none");
    expect(sweep).toMatch(/position:\s*fixed/);
    expect(sweep).toMatch(/animation:\s*none\s*!important/); // the reduced-motion half

    // Exactly three tint declarations in the file, and every one of them must
    // fall inside one of those two rules. A tint anywhere else fails here.
    // Snippets are whitespace-normalised, so normalise the rule bodies too
    // before containment — otherwise a multi-line gradient never matches its
    // own rule and the assertion fails for the wrong reason.
    const flat = (s: string) => s.replace(/\s+/g, " ");
    const [flatBloom, flatSweep] = [flat(bloom), flat(sweep)];

    const cssHits = findVerifiedTints("app/globals.css", CSS);
    expect(cssHits).toHaveLength(3);
    for (const h of cssHits) {
      const probe = h.snippet.slice(0, 40);
      expect(
        flatBloom.includes(probe) || flatSweep.includes(probe),
        `stray verified tint outside the approved rules: ${h.snippet}`,
      ).toBe(true);
    }
  });

  it("the bloom's consumer is aria-hidden and renders no verified text", () => {
    const consumer = read("src/components/onboarding/reputation-demo/DemoAuthorCard.tsx");
    expect(consumer).toMatch(/aria-hidden[\s\S]{0,120}bcc-rep-demo-bloom/);
    // Its verified colour paints Sparkle icons, never a text node.
    expect(consumer).not.toContain("text-verified");
    expect(consumer).toContain("<Sparkle");
  });

  it("the sweep is an aria-hidden full-viewport backdrop of the same toast", () => {
    const toast = read("src/components/celebration/CelebrationToast.tsx");
    expect(toast).toMatch(/aria-hidden[^>]*className="bcc-celebration-sweep|bcc-celebration-sweep/);
    expect(toast).toContain("aria-hidden");
    // Sole consumer — if another surface adopts it, this fails and asks why.
    const users = FILES.filter((f) => /bcc-celebration-sweep/.test(f.code)).map((f) => f.path);
    expect(users).toEqual([
      "app/globals.css",
      "components/celebration/CelebrationToast.tsx",
    ]);
  });

  it("the toast's tint wraps an aria-hidden icon, never text", () => {
    const toast = read("src/components/celebration/CelebrationToast.tsx");
    expect(toast).toContain("aria-hidden");
    expect(toast).toContain("<svg");
    expect(toast).not.toContain("text-verified");
    // Its verified colour is on the svg, not on a text node.
    expect(toast).toMatch(/<svg[\s\S]{0,300}color: "var\(--verified\)"/);
    expect(findVerifiedTints("toast", toast)).toHaveLength(1);
  });

  /**
   * The hardened detector found this one, and it is why the slice touches a
   * second file. `.bcc-pill[data-status="resolved"]` painted a literal `#fff`
   * on the solid verified fill — 5.38:1 in light but **3.43:1 in dark**, since
   * `--bcc-verified` is theme-scoped and a fixed white is not.
   *
   * It is the third instance of the same defect: the verified slice fixed
   * `text-bcc-white` and `var(--cardstock)`, but a raw hex slipped both greps.
   */
  it("the resolved pill is solid verified with INVERSE text", () => {
    const rule = /\.bcc-pill\[data-status="resolved"\][^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(rule, "resolved pill rule not found").not.toBe("");
    expect(rule).toContain("background: var(--verified)");
    expect(rule).toContain("color: var(--bcc-text-inverse)");
  });

  it("the resolved pill clears 4.5:1 in both themes", () => {
    const [vLight, vDark] = [decls("bcc-verified")[0] ?? "", decls("bcc-verified")[1] ?? ""];
    const [invLight, invDark] = [decls("bcc-text-inverse")[0] ?? "", decls("bcc-text-inverse")[1] ?? ""];
    expect(ratio(invLight, vLight)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(invDark, vDark)).toBeGreaterThanOrEqual(4.5);
  });

  it("no hardcoded white or cardstock foreground returns to that rule", () => {
    const rule = /\.bcc-pill\[data-status="resolved"\][^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(rule).not.toMatch(/color:\s*#fff\b|color:\s*#ffffff\b|color:\s*white\b/i);
    expect(rule).not.toContain("var(--cardstock)");
    expect(rule).not.toContain("var(--bcc-white)");
    // The sibling pills are theme-blind tokens, so their fixed --ink
    // foregrounds are correct and must not be "fixed" by mistake.
    const open = /\.bcc-pill\[data-status="open"\][^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(open).toContain("color: var(--ink)");
  });

  it("a solid verified background is NOT misclassified as a prohibited tint", () => {
    // Full-alpha fills are governed by the inverse-text rule above, not by the
    // no-tint rule. If the detector ever starts flagging them, every solid
    // chip becomes a false positive and the guard gets disabled out of noise.
    expect(findVerifiedTints("f", `.x { background: var(--verified); color: var(--bcc-text-inverse); }`)).toEqual([]);
    expect(findVerifiedTints("f", `className="bg-verified text-[var(--bcc-text-inverse)]"`)).toEqual([]);
    expect(findVerifiedTints("f", `background: "var(--verified)",`)).toEqual([]);
    // …and the real rule is likewise clean under the detector.
    const rule = /\.bcc-pill\[data-status="resolved"\][^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(findVerifiedTints("resolved-pill", rule)).toEqual([]);
  });

  it("no verified tint sits in a file that renders readable verified text", () => {
    // The set-equality above already forbids new tints; this states the
    // underlying contract directly, so the reason survives a refactor.
    const offenders = FILES.filter((f) => {
      if (findVerifiedTints(f.path, f.code).length === 0) return false;
      return /text-verified\b/.test(f.code);
    }).map((f) => f.path);
    expect(offenders, "readable verified text over a verified tint").toEqual([]);
  });
});

describe("closing the loop on section 4b", () => {
  it("the eleven text chips are still tint-free under the hardened detector", () => {
    for (const file of VERIFIED_TEXT_CHIPS) {
      const code = read(file)
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(?<!:)\/\/.*$/gm, "");
      expect(findVerifiedTints(file, code), `${file} re-grew a tint`).toEqual([]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. The operator indicator is structural, not chromatic
// ─────────────────────────────────────────────────────────────────────────

describe("the operator indicator no longer relies on colour alone", () => {
  const avatar = read("src/components/identity/Avatar.tsx");
  const mark = read("src/components/identity/OperatorMark.tsx");

  it("the avatar renders the shared glyph, not a coloured disc", () => {
    expect(avatar).toContain('<OperatorMark');
    expect(avatar).toContain('variant="plate"');
    expect(avatar).not.toMatch(/background:\s*"var\(--phosphor\)"/);
    expect(avatar).not.toMatch(/borderRadius:\s*"9999px"[\s\S]{0,80}--phosphor/);
  });

  it("one glyph, shared — the name mark and the avatar mark cannot diverge", () => {
    expect(read("src/components/identity/AuthorCard.tsx")).toContain(
      'import { OperatorMark } from "@/components/identity/OperatorMark"',
    );
    expect(avatar).toContain('import { OperatorMark } from "@/components/identity/OperatorMark"');
    // The SVG path exists in exactly one place now.
    const owners = FILES.filter((f) => f.code.includes("M12 2l2.6 1.9 3.2-.1")).map((f) => f.path);
    expect(owners).toEqual(["components/identity/OperatorMark.tsx"]);
  });

  it("the plate is theme-invariant and clears 3:1 by a wide margin", () => {
    expect(mark).toContain('color: "var(--ink)"');
    expect(mark).toContain('background: "var(--cardstock)"');
    expect(ratio(INK, CARDSTOCK)).toBeGreaterThanOrEqual(3);
    // Both tokens are single-defined, so the value is the same in both themes.
    expect(decls("ink")).toHaveLength(1);
    expect(decls("cardstock")).toHaveLength(1);
  });

  it("records why a colour swap was not enough", () => {
    // Verified would have passed light and FAILED dark against the fixed
    // cream ring. This is the number that forced the structural fix.
    const verifiedDark = decls("bcc-verified")[1] ?? "";
    expect(ratio(verifiedDark, CARDSTOCK)).toBeLessThan(3);
    expect(ratio(PHOSPHOR, CARDSTOCK)).toBeLessThan(1.1);
  });

  it("keeps its accessible name and the sm+ rule", () => {
    expect(avatar).toContain('label="Verified operator/creator on at least one entity."');
    expect(avatar).toContain('size !== "xs"');
    expect(mark).toContain("aria-label={label}");
    expect(mark).toContain('role="img"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. Out-of-scope tokens untouched
// ─────────────────────────────────────────────────────────────────────────

describe("neighbouring tokens were not disturbed", () => {
  it("safety, weld and blueprint keep their values and theme-blindness", () => {
    expect(decls("bcc-safety")).toEqual(["#f05a28"]);
    expect(decls("safety-rgb")).toEqual(["240 90 40"]);
    expect(decls("bcc-weld")).toEqual(["#ffc01e"]);
    expect(decls("bcc-blueprint")).toEqual(["#0f1e3c"]);
  });

  it("verified stays theme-scoped from the previous slice", () => {
    expect(decls("bcc-verified")).toEqual(["#20794e", "#2c9d66", "#2c9d66"]);
    expect(decls("verified-rgb")).toEqual(["32 121 78", "44 157 102", "44 157 102"]);
  });

  it("phosphor itself was NOT retoned or theme-scoped", () => {
    expect(decls("phosphor")).toEqual([PHOSPHOR]);
    expect(decls("phosphor-rgb")).toEqual(["125 255 154"]);
  });
});
