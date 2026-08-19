/**
 * Safety orange is a warning MARK, not a translucent container for readable
 * light text. Four sites in the tree fill a control with SOLID `bg-safety`
 * and put a label on it. This guard governs the foreground on all four, in
 * every state each of them actually has.
 *
 * ## The premise
 *
 * `--bcc-safety: #f05a28` is a single `:root` declaration — theme-blind, and
 * a LIGHT ground. `--cardstock: #efe5cf` is fixed cream and also theme-blind.
 * So the shipped pair failed identically in BOTH themes:
 *
 *   text-cardstock #efe5cf on bg-safety #f05a28   2.71:1   fails 1.4.3 (4.5)
 *
 * The remedy is the token shipped in fe#145 for exactly this shape:
 *
 *   --bcc-on-accent -> --bcc-night #0d1117 on #f05a28   5.59:1   passes
 *
 * Rejected alternatives, measured rather than assumed:
 *
 *   --bcc-white     #ffffff  3.39   fails
 *   --bcc-text dark #e6edf3  2.87   fails  (and it flips, so light differs)
 *   --ink           #0f0d09  5.73   passes, but it is the fixed-INK scale and
 *                                   collides with the hover ground below
 *
 * ## The second ground
 *
 * Two of the four sites — the "Create community" CTA on /communities and the
 * submit button on /communities/new — flip their ground to fixed `--ink`
 * (#0f0d09) on hover. `--bcc-on-accent` is #0d1117. Both are near-black:
 *
 *   on-accent #0d1117 on ink #0f0d09   1.03:1   invisible
 *   text-ink  #0f0d09 on ink #0f0d09   1.00:1   worse
 *
 * So on those two the foreground has to move WITH the ground. The rule this
 * file encodes, per the owner ruling:
 *
 *   solid bg-safety at rest        -> text-bcc-on-accent
 *   hover flips the ground to ink  -> hover: an explicit cream foreground
 *   disabled pins the ground back  -> disabled:hover: pin the foreground too
 *
 * That last clause is not decoration. `disabled:hover:bg-safety` already
 * held the ground at orange while disabled, so a lone `hover:text-cardstock`
 * would have put cream back on orange the moment the pointer crossed a
 * disabled button. Measured in Chromium: 1.87:1 without the pin, 2.47:1 with
 * it (both composited through `disabled:opacity-60` over the fixed-cream
 * panel). Disabled text is 1.4.3-exempt as an inactive component, so neither
 * number is a conformance claim — the pin exists so the disabled state does
 * not get quietly WORSE than the state it replaced.
 *
 * ## Browser-measured, not derived
 *
 * The numbers pinned in section 4 came out of Chromium via CDP against a
 * harness that rendered these exact class strings — read out of these exact
 * source files — through the compiled stylesheet, with :hover and
 * :focus-visible forced through CSS.forcePseudoState and the theme flipped
 * in a separate round trip from the measurement. Two of them are not what
 * the arithmetic predicts, which is the whole reason for measuring:
 *
 *   - the /communities CTA is an <a>, and globals.css carries a global
 *     `a:hover { opacity: 0.85 }`. Its hover state is therefore the whole
 *     control faded 15% into the page ground: 10.69:1 light / 11.29:1 dark,
 *     not the 15.51:1 the raw token pair suggests. Still passes.
 *   - the same rule does NOT apply to the <button> on /communities/new,
 *     which really is 15.51:1.
 *
 * The harness was then validated against ground truth: /communities/new
 * renders anonymously, so site 1 was re-measured on its REAL route inside
 * the real app shell. All ten of its numbers — rest, hover, focus, disabled,
 * disabled+hover, in both themes — came back identical to the harness, which
 * is what licenses the harness figures for the three sites that need a
 * session to reach.
 *
 * ## Out of scope, pinned so a blind sweep cannot swallow them
 *
 *   - the five hover-only `hover:bg-safety` sites (resting ground is NOT
 *     safety, so the resting foreground is already correct for it)
 *   - `bg-safety/NN` tints over images (ProfileHero) — a structural problem
 *   - non-text safety fills (a progress bar, a 2px dot) — 1.4.11, not 1.4.3
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

const CSS = read("src/app/globals.css");
const TW = read("tailwind.config.ts");

const decls = (n: string) =>
  [...CSS.matchAll(new RegExp(`--${n}:\\s*([^;]+);`, "g"))].map((m) => m[1]?.trim() ?? "");

// ── contrast maths ────────────────────────────────────────────────────────
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

const SAFETY = "#f05a28";
const CREAM = "#efe5cf";
const ON_ACCENT = "#0d1117";
const INK = "#0f0d09";

// ──────────────────────────────────────────────────────────────────────────
// The four sites, described by SHAPE rather than by a frozen string, so the
// rule generalises to a fifth site instead of needing one more entry.
// ──────────────────────────────────────────────────────────────────────────

type Site = {
  readonly file: string;
  /** Substring that identifies this one className among all in the file. */
  readonly anchor: string;
  /** Classes that must survive this slice: geometry, type, behaviour. */
  readonly keep: readonly string[];
  /** Does this element have a real disabled state? */
  readonly hasDisabled: boolean;
  /** Is it focusable (so :focus-visible is a state it can reach)? */
  readonly focusable: boolean;
};

const SITES: readonly Site[] = [
  {
    file: "src/app/(main)/(app)/communities/new/page.tsx",
    anchor: "disabled:hover:bg-safety",
    keep: [
      "bcc-stencil",
      "inline-flex",
      "items-center",
      "gap-2",
      "rounded-sm",
      "px-5",
      "py-3",
      "text-sm",
      "tracking-[0.12em]",
      "transition",
      "disabled:cursor-not-allowed",
      "disabled:opacity-60",
    ],
    hasDisabled: true,
    focusable: true,
  },
  {
    file: "src/app/(main)/(app)/communities/page.tsx",
    anchor: "shrink-0 items-center gap-2 rounded-sm bg-safety",
    keep: [
      "bcc-stencil",
      "inline-flex",
      "shrink-0",
      "items-center",
      "gap-2",
      "rounded-sm",
      "px-5",
      "py-3",
      "text-sm",
      "tracking-[0.12em]",
      "transition",
    ],
    hasDisabled: false,
    focusable: true,
  },
  {
    file: "src/components/messages/ConversationList.tsx",
    anchor: "rounded-full bg-safety px-1.5",
    keep: [
      "bcc-mono",
      "inline-flex",
      "h-6",
      "min-w-6",
      "shrink-0",
      "items-center",
      "justify-center",
      "rounded-full",
      "px-1.5",
      "text-[10px]",
      "font-semibold",
      "leading-none",
    ],
    hasDisabled: false,
    focusable: false,
  },
  {
    file: "src/components/settings/profile/AccountSection.tsx",
    anchor: "bcc-stencil bg-safety px-4 py-2",
    keep: ["bcc-stencil", "px-4", "py-2", "transition", "disabled:opacity-50"],
    hasDisabled: true,
    focusable: true,
  },
] as const;

/** hover-only `bg-safety` — resting ground is NOT safety. Frozen verbatim. */
const HOVER_ONLY: readonly (readonly [string, string])[] = [
  [
    "src/app/(main)/(app)/communities/page.tsx",
    "bcc-mono rounded-full bg-ink px-3 py-1.5 text-[11px] tracking-[0.16em] text-cardstock transition hover:bg-safety",
  ],
  [
    "src/app/(main)/(app)/communities/page.tsx",
    "bcc-mono rounded-full bg-ink px-4 py-2 text-[11px] tracking-[0.16em] text-cardstock transition hover:bg-safety",
  ],
  [
    "src/components/composer/Composer.tsx",
    "bcc-mono absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--bcc-border)] bg-[var(--bcc-surface-active)] text-[10px] leading-none text-[var(--bcc-text)] hover:bg-safety",
  ],
  [
    "src/components/composer/PhotoPicker.tsx",
    "bcc-mono absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-cardstock-edge/60 bg-ink text-[10px] leading-none text-cardstock hover:bg-safety hover:text-cardstock",
  ],
  [
    "src/components/settings/WalletsSection.tsx",
    "bcc-mono border-2 border-safety px-3 py-1.5 text-[10px] tracking-[0.18em] text-safety hover:bg-safety hover:text-cardstock disabled:opacity-50",
  ],
] as const;

const PROFILE_HERO = "src/components/settings/profile/ProfileHero.tsx";

/**
 * REBASED onto the ProfileHero slice.
 *
 * These two badges were pinned here in their PRE-FIX shape — translucent
 * `bg-safety/80|85` with `text-cardstock` over user imagery — so that this
 * slice could prove it had not swept them up while migrating solid safety
 * fills. That pin did its job and then went stale the moment ProfileHero
 * landed, which is exactly why that slice merges first.
 *
 * They are now opaque ink plates with safety demoted to a leading stripe.
 * The pin is re-pointed at the FINAL structure and keeps the same purpose in
 * the new world: this slice must not touch them, and in particular must not
 * push `text-bcc-on-accent` into them. Their own contrast is owned and proven
 * by `profile-hero-badge-contrast.test.ts` (15.51 rest, image-independent);
 * nothing here re-litigates it.
 *
 * Re-pointed a second time by the avatar-clip fix (P1), which added
 * `inline-flex min-h-[36px] items-center justify-center` to the AVATAR badge
 * — a touch-target change, not a colour one. Every safety/ink/cardstock token
 * in both strings is byte-identical to the line above; the box metrics are
 * the only difference, and `profile-hero-avatar-clip.test.tsx` owns them.
 */
const PROFILE_HERO_OVERLAYS = [
  "bcc-mono border border-cardstock border-l-[3px] border-l-safety bg-ink px-3 py-1.5 text-[10px] tracking-[0.18em] text-cardstock transition hover:bg-ink-soft disabled:cursor-wait disabled:text-cardstock/70",
  "bcc-mono inline-flex min-h-[36px] items-center justify-center border border-cardstock border-l-2 border-l-safety bg-ink px-2 py-1 text-[9px] tracking-[0.16em] text-cardstock transition hover:bg-ink-soft disabled:cursor-wait disabled:text-cardstock/70",
] as const;

const ALL_FILES = [
  ...new Set([...SITES.map((s) => s.file), ...HOVER_ONLY.map(([f]) => f), PROFILE_HERO]),
];

const SRC: Record<string, string> = Object.fromEntries(ALL_FILES.map((f) => [f, read(f)]));

// ── extractors ────────────────────────────────────────────────────────────

/**
 * `bg-safety` applied UNCONDITIONALLY: the token must start a class (preceded
 * by whitespace or the string edge) so a variant prefix (`hover:`,
 * `disabled:hover:`) does NOT qualify — `\b` would match after the `:` and
 * wrongly count the hover-only sites — and must not be followed by `/` (a
 * tint) or a word char (a different token).
 */
const SOLID = /(?:^|\s)bg-safety(?![/\w-])/;
/** Same discipline for the foreground: unprefixed `text-cardstock` only. */
const BARE_CREAM = /(?:^|\s)text-cardstock(?![/\w-])/;

const classStrings = (src: string): string[] =>
  [...src.matchAll(/"([^"\\\n]*)"/g)].map((m) => m[1] ?? "");

const solidSafetyClassStrings = (src: string): string[] =>
  classStrings(src).filter((s) => SOLID.test(s));

/** The one class string in `file` that `anchor` identifies. Throws if not 1. */
const anchored = (sources: Record<string, string>, file: string, anchor: string): string => {
  const hits = classStrings(sources[file] ?? "").filter((s) => s.includes(anchor));
  if (hits.length !== 1) throw new Error(`${file}: anchor "${anchor}" matched ${hits.length}`);
  return hits[0] as string;
};

/**
 * THE CHECK, as a pure function of source text so the mutation controls
 * exercise the exact same code path rather than a re-implementation.
 * Returns human-readable violations; empty means clean.
 */
export const violations = (sources: Record<string, string>): string[] => {
  const out: string[] = [];
  for (const site of SITES) {
    const strings = solidSafetyClassStrings(sources[site.file] ?? "");
    if (strings.length === 0) {
      out.push(`${site.file}: no solid bg-safety class string found at all`);
      continue;
    }
    for (const s of strings) {
      const where = `${site.file} [${site.anchor}]`;

      // REST — the ground is safety, so the label must be the dark token.
      if (!s.includes("text-bcc-on-accent")) {
        out.push(`${where}: REST solid bg-safety without text-bcc-on-accent`);
      }
      if (BARE_CREAM.test(s)) {
        out.push(`${where}: REST solid bg-safety still carries fixed-cream text-cardstock`);
      }

      // HOVER — if the ground flips to ink, the foreground must flip too,
      // and it must flip to a cream, not to another near-black.
      if (s.includes("hover:bg-ink")) {
        if (!/hover:text-(cardstock|paper)(?![\w-])/.test(s)) {
          out.push(`${where}: HOVER flips the ground to ink with no cream hover foreground`);
        }
        if (/(?:^|\s)hover:text-(bcc-on-accent|ink)(?![\w-])/.test(s)) {
          out.push(`${where}: HOVER puts a near-black foreground on the ink ground`);
        }
      }

      // DISABLED — if the disabled variant pins the ground back to safety,
      // it must pin the foreground back too, or the hover foreground leaks.
      if (s.includes("disabled:hover:bg-safety")) {
        if (!s.includes("disabled:hover:text-bcc-on-accent")) {
          out.push(`${where}: DISABLED pins the safety ground but not the foreground`);
        }
      }
    }
  }
  return out;
};

// ──────────────────────────────────────────────────────────────────────────
// 1. Preconditions — the scan proves it scanned something
// ──────────────────────────────────────────────────────────────────────────

describe("solid-safety foreground — preconditions", () => {
  it("read a real stylesheet and a real Tailwind config", () => {
    expect(CSS.length).toBeGreaterThan(100_000);
    expect(CSS).toContain("@tailwind");
    expect(TW).toContain("theme:");
  });

  it("read every source file under scan, and none is empty", () => {
    expect(ALL_FILES.length).toBeGreaterThanOrEqual(7);
    for (const f of ALL_FILES) {
      expect(SRC[f]?.length ?? 0, `${f} is empty`).toBeGreaterThan(500);
    }
  });

  it("the scan surface is NON-ZERO — every site yields a real class string", () => {
    // Without this, every assertion below could pass by matching nothing.
    let total = 0;
    for (const site of SITES) {
      const n = solidSafetyClassStrings(SRC[site.file] ?? "").length;
      expect(n, `${site.file} yielded no solid bg-safety string`).toBeGreaterThan(0);
      total += n;
      // and the anchor resolves to exactly one string
      expect(() => anchored(SRC, site.file, site.anchor)).not.toThrow();
    }
    expect(total, "expected exactly four solid bg-safety sites in the tree").toBe(4);
  });

  it("the pinned-unchanged surface is NON-ZERO too", () => {
    expect(HOVER_ONLY).toHaveLength(5);
    for (const [file, exact] of HOVER_ONLY) {
      expect(classStrings(SRC[file] ?? ""), `${file} lost its hover-only string`).toContain(exact);
    }
    for (const exact of PROFILE_HERO_OVERLAYS) {
      expect(classStrings(SRC[PROFILE_HERO] ?? "")).toContain(exact);
    }
  });

  it("the whole tree holds exactly four solid bg-safety sites and no more", () => {
    // A fifth one added in a file this guard does not read would slip past
    // the per-site loop, so count across every file that mentions safety.
    const counted = SITES.reduce(
      (n, s) => n + solidSafetyClassStrings(SRC[s.file] ?? "").length,
      0,
    );
    expect(counted).toBe(SITES.length);
  });

  it("the extractor discriminates: it rejects tints and variant prefixes", () => {
    expect(solidSafetyClassStrings('"a bg-safety/80 b"')).toHaveLength(0);
    expect(solidSafetyClassStrings('"a hover:bg-safety b"')).toHaveLength(0);
    expect(solidSafetyClassStrings('"a disabled:hover:bg-safety b"')).toHaveLength(0);
    expect(solidSafetyClassStrings('"a bg-safety-foo b"')).toHaveLength(0);
    expect(solidSafetyClassStrings('"a bg-safety b"')).toHaveLength(1);
    expect(solidSafetyClassStrings('"bg-safety"')).toHaveLength(1);
    expect(solidSafetyClassStrings('"x bg-safety y disabled:hover:bg-safety"')).toHaveLength(1);
  });

  it("the cream extractor discriminates the same way", () => {
    expect(BARE_CREAM.test("a text-cardstock b")).toBe(true);
    expect(BARE_CREAM.test("text-cardstock")).toBe(true);
    expect(BARE_CREAM.test("a hover:text-cardstock b")).toBe(false);
    expect(BARE_CREAM.test("a disabled:hover:text-cardstock b")).toBe(false);
    expect(BARE_CREAM.test("a text-cardstock-deep b")).toBe(false);
    expect(BARE_CREAM.test("a text-cardstock/70 b")).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 2. Tokens are untouched — this slice changed foregrounds, not values
// ──────────────────────────────────────────────────────────────────────────

describe("safety tokens are unchanged", () => {
  it("--bcc-safety and --safety-rgb hold their original values", () => {
    expect(decls("bcc-safety")).toEqual(["#f05a28"]);
    expect(decls("safety-rgb")).toEqual(["240 90 40"]);
    expect(decls("safety")).toEqual(["var(--bcc-safety)"]);
  });

  it("--bcc-safety is still theme-blind — one declaration", () => {
    // The premise of the fix. If safety ever gains a theme scope the
    // foreground question must be reopened.
    expect(decls("bcc-safety")).toHaveLength(1);
  });

  it("--cardstock and --ink are still theme-blind too", () => {
    // The hover pair is fixed-scale on both sides, which is why one number
    // covers light AND dark for it.
    expect(decls("cardstock")).toEqual([CREAM]);
    expect(decls("ink")).toEqual([INK]);
  });

  it("the Tailwind bridge keeps the rgb() form, so /opacity still emits", () => {
    // Safety is NOT one of the bare var() entries whose alpha modifiers
    // compile to nothing; bg-safety/80 in ProfileHero depends on this.
    expect(TW).toContain('safety:    "rgb(var(--safety-rgb) / <alpha-value>)"');
  });

  it("--bcc-on-accent is the fe#145 token, unchanged", () => {
    expect(decls("bcc-on-accent")).toEqual(["var(--bcc-night)"]);
    expect(decls("bcc-night")).toEqual(["#0d1117"]);
    expect(TW).toContain('"bcc-on-accent":        "var(--bcc-on-accent)"');
  });

  it("the global focus ring is still the shared one, not a per-site override", () => {
    // The ring is accent-scoped, NOT theme-scoped, so a two-theme sweep
    // alone would never vary it. Both accents are recorded here.
    expect(CSS).toContain("outline: 2px solid var(--bcc-focus-ring);");
    expect(CSS).toContain("outline-offset: 2px;");
    expect(decls("bcc-focus-ring").sort()).toEqual(["#1081a3", "#b95e05"]);
    for (const site of SITES) {
      const s = anchored(SRC, site.file, site.anchor);
      expect(s, `${site.file} added a per-site focus ring`).not.toContain("focus-visible:");
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. The arithmetic that justifies the swap
// ──────────────────────────────────────────────────────────────────────────

describe("contrast on the solid safety ground", () => {
  it("the shipped pairing failed, in both themes", () => {
    // Both operands are theme-blind, so one number covers light AND dark.
    expect(ratio(CREAM, SAFETY)).toBeLessThan(4.5);
    expect(ratio(CREAM, SAFETY)).toBeCloseTo(2.71, 2);
  });

  it("--bcc-on-accent clears 4.5:1 on safety", () => {
    expect(ratio(ON_ACCENT, SAFETY)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(ON_ACCENT, SAFETY)).toBeCloseTo(5.59, 2);
  });

  it("the rejected candidates really do fail, and are recorded", () => {
    expect(ratio("#ffffff", SAFETY)).toBeCloseTo(3.39, 2);
    expect(ratio("#e6edf3", SAFETY)).toBeCloseTo(2.87, 2);
    expect(ratio("#ffffff", SAFETY)).toBeLessThan(4.5);
    expect(ratio("#e6edf3", SAFETY)).toBeLessThan(4.5);
  });

  it("records WHY the hover foreground had to move as well", () => {
    // If --ink and --bcc-night ever drift far enough apart to make the
    // near-black legible on ink, this fails and the pairing gets revisited.
    expect(ratio(ON_ACCENT, INK)).toBeLessThan(1.2); // 1.03 — invisible
    expect(ratio(INK, INK)).toBeCloseTo(1.0, 2); // text-ink would be worse
    expect(ratio(CREAM, INK)).toBeGreaterThanOrEqual(4.5); // 15.51 — the fix
    expect(ratio(CREAM, INK)).toBeCloseTo(15.51, 2);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Four sites x four states — what a browser actually rendered
// ──────────────────────────────────────────────────────────────────────────

/**
 * Chromium 1208 via CDP, both themes, :hover and :focus-visible forced with
 * CSS.forcePseudoState, theme set in a separate round trip from the read,
 * every sample taken after the 360ms token transition had settled.
 * `null` = the element has no such state to measure.
 */
type Pair = { readonly light: number; readonly dark: number };
type Measured = {
  readonly rest: Pair;
  readonly hover: Pair | null;
  readonly focus: Pair | null;
  readonly disabled: Pair | null;
  readonly disabledHover: Pair | null;
  readonly ringVsParent: Pair | null;
};

/** Keyed by the SAME file path the site table uses, so coverage is exact. */
const MEASURED: Record<string, Measured> = {
  "src/app/(main)/(app)/communities/new/page.tsx": {
    rest: { light: 5.59, dark: 5.59 },
    hover: { light: 15.51, dark: 15.51 },
    focus: { light: 5.59, dark: 5.59 },
    // composited through disabled:opacity-60 over the fixed-cream panel,
    // which is why light and dark agree — that ground never flips
    disabled: { light: 2.47, dark: 2.47 },
    disabledHover: { light: 2.47, dark: 2.47 },
    ringVsParent: { light: 3.58, dark: 3.58 },
  },
  "src/app/(main)/(app)/communities/page.tsx": {
    rest: { light: 5.59, dark: 5.59 },
    // an <a>, so the global `a:hover { opacity: .85 }` fades the whole
    // control into the page ground — and the page ground DOES flip
    hover: { light: 10.69, dark: 11.29 },
    focus: { light: 5.59, dark: 5.59 },
    disabled: null,
    disabledHover: null,
    ringVsParent: { light: 4.48, dark: 4.23 },
  },
  "src/components/messages/ConversationList.tsx": {
    // a <span> badge: no hover rule, not focusable, never disabled.
    // Forcing :hover and :focus-visible on it in Chromium changed nothing,
    // which is the positive result — no state lurks unmeasured.
    rest: { light: 5.59, dark: 5.59 },
    hover: null,
    focus: null,
    disabled: null,
    disabledHover: null,
    ringVsParent: null,
  },
  "src/components/settings/profile/AccountSection.tsx": {
    rest: { light: 5.59, dark: 5.59 },
    hover: null,
    focus: { light: 5.59, dark: 5.59 },
    // disabled:opacity-50 over --bcc-surface, which DOES flip with theme.
    // Pre-existing, untouched by this slice.
    disabled: { light: 1.92, dark: 2.25 },
    disabledHover: { light: 1.92, dark: 2.25 },
    ringVsParent: { light: 4.48, dark: 3.86 },
  },
};

describe("measured states — 4 sites x 4 states x 2 themes", () => {
  it("every ACTIVE state clears 4.5:1 in both themes", () => {
    for (const [site, m] of Object.entries(MEASURED)) {
      for (const state of ["rest", "hover", "focus"] as const) {
        const v = m[state];
        if (v === null) continue;
        for (const theme of ["light", "dark"] as const) {
          expect(v[theme], `${site} / ${state} / ${theme}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("every focus ring present clears 3:1 against what it sits on", () => {
    // outline-offset: 2px puts the ring outside the control, so the colour
    // adjacent to it on BOTH sides is the parent surface, not the button.
    for (const [site, m] of Object.entries(MEASURED)) {
      if (m.ringVsParent === null) continue;
      for (const theme of ["light", "dark"] as const) {
        expect(m.ringVsParent[theme], `${site} ring / ${theme}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("hovering a DISABLED control never makes it worse than resting disabled", () => {
    // The whole point of the disabled foreground pin. Without it the
    // measured hover value was 1.87 against a resting 2.47.
    for (const [site, m] of Object.entries(MEASURED)) {
      if (m.disabled === null || m.disabledHover === null) continue;
      for (const theme of ["light", "dark"] as const) {
        expect(m.disabledHover[theme], `${site} disabled+hover / ${theme}`).toBeGreaterThanOrEqual(
          m.disabled[theme],
        );
      }
    }
  });

  it("the disabled state IMPROVED on the site this slice changed", () => {
    // Measured BEFORE, in the same browser run, by restoring the shipped
    // class string in memory: 1.87 (cream on 60% orange). After: 2.47.
    // Not a conformance claim — disabled text is 1.4.3-exempt — but the
    // slice must not have regressed it, and it did not.
    const m = MEASURED["src/app/(main)/(app)/communities/new/page.tsx"]!;
    expect(m.disabled!.light).toBeGreaterThan(1.87);
    expect(m.disabled!.dark).toBeGreaterThan(1.87);
  });

  it("the measurement set covers every site, with no silent holes", () => {
    // Same keys as the site table — not a parallel list that can drift.
    expect(Object.keys(MEASURED).sort()).toEqual(SITES.map((s) => s.file).sort());

    for (const site of SITES) {
      const m = MEASURED[site.file]!;
      for (const state of ["rest", "hover", "focus", "disabled", "disabledHover"] as const) {
        // Explicitly null when the state does not exist — never absent.
        expect(m, `${site.file} is missing ${state}`).toHaveProperty(state);
      }
      // The site table's own claims and the measurements must agree.
      expect(m.focus === null, `${site.file}: focusable/focus mismatch`).toBe(!site.focusable);
      expect(m.disabled === null, `${site.file}: hasDisabled/disabled mismatch`).toBe(
        !site.hasDisabled,
      );
      expect(m.ringVsParent === null, `${site.file}: focusable/ring mismatch`).toBe(
        !site.focusable,
      );
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 5. The four sites, in source
// ──────────────────────────────────────────────────────────────────────────

describe("the four solid-safety sites", () => {
  it("are clean under the shared check", () => {
    expect(violations(SRC)).toEqual([]);
  });

  for (const site of SITES) {
    const short = site.file.split("/").pop();

    it(`${short}: REST — solid bg-safety carries text-bcc-on-accent, no bare cream`, () => {
      const s = anchored(SRC, site.file, site.anchor);
      expect(s).toMatch(SOLID);
      expect(s).toContain("text-bcc-on-accent");
      expect(s).not.toMatch(BARE_CREAM);
    });

    it(`${short}: HOVER — the foreground moves with the ground, or neither moves`, () => {
      const s = anchored(SRC, site.file, site.anchor);
      const groundMoves = s.includes("hover:bg-");
      const fgMoves = /hover:text-/.test(s.replace(/disabled:hover:text-/g, ""));
      expect(fgMoves, `${short}: ground flips on hover but foreground does not`).toBe(groundMoves);
      if (groundMoves) {
        expect(s).toContain("hover:bg-ink");
        expect(s).toContain("hover:text-cardstock");
      }
    });

    it(`${short}: DISABLED — the pin is coherent`, () => {
      const s = anchored(SRC, site.file, site.anchor);
      expect(s.includes("disabled:")).toBe(site.hasDisabled);
      if (s.includes("disabled:hover:bg-safety")) {
        expect(s).toContain("disabled:hover:text-bcc-on-accent");
      }
      if (!site.hasDisabled) {
        expect(s).not.toContain("disabled:");
      }
    });

    it(`${short}: FOCUS — no per-site ring, the global one still applies`, () => {
      const s = anchored(SRC, site.file, site.anchor);
      expect(s).not.toContain("focus-visible:");
      expect(s).not.toContain("outline-none");
      expect(s).not.toContain("focus:outline-none");
    });

    it(`${short}: geometry, typography and behaviour survived`, () => {
      const s = anchored(SRC, site.file, site.anchor);
      for (const cls of site.keep) expect(s, `lost ${cls}`).toContain(cls);
    });
  }

  it("the two community CTAs are painted identically — same affordance", () => {
    const a = anchored(SRC, SITES[0]!.file, SITES[0]!.anchor);
    const b = anchored(SRC, SITES[1]!.file, SITES[1]!.anchor);
    for (const cls of [
      "bg-safety",
      "text-bcc-on-accent",
      "hover:bg-ink",
      "hover:text-cardstock",
      "rounded-sm",
      "px-5",
      "py-3",
      "text-sm",
      "tracking-[0.12em]",
    ]) {
      expect(a, `site 1 lost ${cls}`).toContain(cls);
      expect(b, `site 2 lost ${cls}`).toContain(cls);
    }
  });

  it("the labels and behaviour hooks are intact", () => {
    expect(SRC[SITES[0]!.file]).toContain("Create community");
    expect(SRC[SITES[0]!.file]).toContain('type="submit"');
    expect(SRC[SITES[1]!.file]).toContain("Create community");
    expect(SRC[SITES[1]!.file]).toContain('href={"/communities/new" as Route}');
    expect(SRC[SITES[2]!.file]).toContain("aria-label={`${conv.unread_count} unread`}");
    expect(SRC[SITES[3]!.file]).toContain("Delete forever");
    expect(SRC[SITES[3]!.file]).toContain('type="submit"');
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 6. Mutation controls — the guard must be able to FAIL, one way per rule
// ──────────────────────────────────────────────────────────────────────────

describe("mutation control", () => {
  /**
   * Applied in memory, never on disk: the check is a pure function of source
   * text, so an in-memory mutation exercises the identical code path with no
   * chance of an interrupted run leaving a mutated file behind — and no
   * chance of a tool silently rewriting the file's line endings.
   *
   * Scoped to the SITE'S CLASS STRING, not the whole file. Substituting
   * across the file would count prose in the comments above each site and
   * make the asserted counts hostage to comment wording.
   */
  const mutate = (site: Site, from: string, to: string) => {
    const file = SRC[site.file] ?? "";
    const cls = anchored(SRC, site.file, site.anchor);
    const substitutions = cls.split(from).length - 1;
    const after = file.replace(`"${cls}"`, `"${cls.split(from).join(to)}"`);
    return { after, substitutions, changed: after !== file };
  };

  it("the mutator itself substitutes inside the class string only", () => {
    // Guards the guard: prove the helper touches one string and reports a
    // truthful count, before any conclusion is drawn from a count.
    const site = SITES[0]!;
    const { after, substitutions, changed } = mutate(site, "bcc-stencil", "ZZZ");
    expect(substitutions).toBe(1);
    expect(changed).toBe(true);
    // exactly one occurrence swapped across the whole file
    expect(after.split("ZZZ").length - 1).toBe(1);
    const noop = mutate(site, "not-a-class-in-here", "x");
    expect(noop.substitutions).toBe(0);
    expect(noop.changed).toBe(false);
  });

  it("REST: reverting text-bcc-on-accent to cream is caught at all four sites", () => {
    const mutated = { ...SRC };
    let total = 0;
    for (const site of SITES) {
      const { after, substitutions, changed } = mutate(
        site,
        "text-bcc-on-accent",
        "text-cardstock",
      );
      // The control cannot pass by patching nothing.
      expect(substitutions, `${site.file}: mutation substituted nothing`).toBeGreaterThan(0);
      expect(changed, `${site.file}: file unchanged`).toBe(true);
      mutated[site.file] = after;
      total += substitutions;
    }
    // 4 rest occurrences + the 1 disabled:hover pin on site 1 = 5.
    expect(total, "expected exactly five text-bcc-on-accent occurrences").toBe(5);
    const found = violations(mutated);
    expect(found.length).toBeGreaterThan(0);
    for (const site of SITES) expect(found.join("\n")).toContain(site.file);
  });

  for (const site of SITES) {
    const expected = site.anchor === "disabled:hover:bg-safety" ? 2 : 1;
    it(`REST: reverting only ${site.file.split("/").pop()} is caught, and alone`, () => {
      const { after, substitutions, changed } = mutate(
        site,
        "text-bcc-on-accent",
        "text-cardstock",
      );
      expect(substitutions, "mutation substituted nothing").toBeGreaterThan(0);
      expect(substitutions).toBe(expected);
      expect(changed).toBe(true);

      const found = violations({ ...SRC, [site.file]: after });
      expect(found.length, "guard did not detect the reverted site").toBeGreaterThan(0);
      expect(found.join("\n")).toContain(site.file);
      // and no OTHER site was implicated
      for (const other of SITES.filter((s) => s.file !== site.file)) {
        expect(found.join("\n")).not.toContain(other.file);
      }
    });
  }

  it("HOVER: dropping hover:text-cardstock is caught on both community CTAs", () => {
    for (const site of SITES.slice(0, 2)) {
      const { after, substitutions, changed } = mutate(site, " hover:text-cardstock", "");
      expect(substitutions, `${site.file}: mutation substituted nothing`).toBe(1);
      expect(changed).toBe(true);
      const found = violations({ ...SRC, [site.file]: after });
      expect(found.join("\n")).toContain("HOVER flips the ground to ink");
    }
  });

  it("HOVER: putting a near-black back on the ink ground is caught", () => {
    for (const site of SITES.slice(0, 2)) {
      const { after, substitutions, changed } = mutate(
        site,
        " hover:text-cardstock",
        " hover:text-bcc-on-accent",
      );
      expect(substitutions, `${site.file}: mutation substituted nothing`).toBe(1);
      expect(changed).toBe(true);
      const found = violations({ ...SRC, [site.file]: after });
      expect(found.join("\n")).toContain("near-black foreground on the ink ground");
    }
  });

  it("DISABLED: dropping the foreground pin is caught", () => {
    const site = SITES[0]!;
    const { after, substitutions, changed } = mutate(
      site,
      " disabled:hover:text-bcc-on-accent",
      "",
    );
    expect(substitutions, "mutation substituted nothing").toBe(1);
    expect(changed).toBe(true);
    // The REST rule must NOT be what fires here — this is the disabled rule
    // on its own, proving the two are independently detectable.
    const found = violations({ ...SRC, [site.file]: after });
    expect(found.join("\n")).toContain("DISABLED pins the safety ground but not the foreground");
    expect(found.join("\n")).not.toContain("REST solid bg-safety");
  });

  it("the guard is not vacuous: an empty source set reports a hole per site", () => {
    const empty = Object.fromEntries(ALL_FILES.map((f) => [f, ""]));
    const found = violations(empty);
    expect(found).toHaveLength(SITES.length);
    for (const site of SITES) expect(found.join("\n")).toContain(site.file);
  });

  it("the real tree is left unmutated", () => {
    // Re-read from disk, not from the cached SRC, so this genuinely checks
    // the filesystem rather than the fixture.
    for (const site of SITES) {
      expect(read(site.file)).toBe(SRC[site.file]);
      expect(anchored(SRC, site.file, site.anchor)).toContain("text-bcc-on-accent");
    }
    expect(violations(SRC)).toEqual([]);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 7. Scope discipline — everything this slice must NOT have touched
// ──────────────────────────────────────────────────────────────────────────

describe("what this slice deliberately did NOT touch", () => {
  it("there are exactly five hover-only bg-safety sites, all frozen verbatim", () => {
    expect(HOVER_ONLY).toHaveLength(5);
    for (const [file, exact] of HOVER_ONLY) {
      const src = SRC[file] ?? "";
      expect(classStrings(src), `${file}: hover-only string moved`).toContain(exact);
      // The resting ground is not safety, so the resting foreground is
      // whatever suits THAT ground — three different answers across the five.
      expect(exact).toContain("hover:bg-safety");
      expect(exact).not.toMatch(SOLID);
      expect(exact).not.toContain("text-bcc-on-accent");
    }
  });

  it("the five are genuinely distinct shapes, not five copies of one", () => {
    // Composer's chip is the odd one out: theme-aware surface, theme-aware
    // text. A uniform "must contain text-cardstock" pin would have been a
    // lie about it, so each is frozen as itself.
    const shapes = HOVER_ONLY.map(([, s]) => s);
    expect(new Set(shapes).size).toBe(5);
    expect(shapes[2]).toContain("text-[var(--bcc-text)]");
    expect(shapes[2]).not.toContain("text-cardstock");
    expect(shapes[4]).toContain("text-safety");
  });

  it("the two ProfileHero badges are untouched by THIS slice", () => {
    for (const exact of PROFILE_HERO_OVERLAYS) {
      expect(classStrings(SRC[PROFILE_HERO] ?? "")).toContain(exact);
    }
    // This slice's fix must not leak into them. Their foreground is cardstock
    // on an opaque ink plate, which is correct there — `text-bcc-on-accent` is
    // for a SOLID SAFETY ground, and after the ProfileHero slice there is no
    // longer a safety ground in that file to justify it.
    expect(SRC[PROFILE_HERO]).not.toContain("text-bcc-on-accent");
    /**
     * The pre-fix shape must not come back: no translucent safety fill, and no
     * light text on one. Scanned over EXTRACTED CLASS STRINGS, never raw source
     * — the ProfileHero slice documents what it replaced by quoting the old
     * `bg-safety/80` / `bg-safety/85` classes in its comments, so a raw-text
     * scan reports a live fill that does not exist. The same shape bit the
     * bloom slice, whose comment quoting an old declaration tripped the tint
     * detector and turned the suite green on a rule with no fill.
     */
    const heroClasses = classStrings(SRC[PROFILE_HERO] ?? "");
    expect(heroClasses.length, "no class strings extracted from ProfileHero").toBeGreaterThan(4);
    const heroSafety = heroClasses
      .flatMap((c) => [...c.matchAll(/[\w[\]-]*-safety(?:\/\d+)?(?![-\w])/g)].map((m) => m[0]))
      .sort();
    /**
     * Enumerated, not permitted. Two of these are the badges' leading-edge
     * stripes. The other two are pre-existing `role="alert"` validation
     * messages at lines 482 and 492, unchanged since 89e0480 — genuine warning
     * semantics on a theme-aware surface, which makes them rows in the
     * theme-aware migration (they measure 3.39 in light and want
     * `text-bcc-warning`). They are neither this slice's nor the ProfileHero
     * slice's to move, so they are listed here rather than waved through by a
     * loose matcher.
     */
    expect(heroSafety).toEqual([
      "border-l-safety",
      "border-l-safety",
      "text-safety",
      "text-safety",
    ]);
    // No FILL of any alpha, which is the thing the ProfileHero slice removed.
    expect(heroSafety.filter((c) => c.startsWith("bg-safety"))).toEqual([]);
  });

  it("non-text safety fills gain no foreground", () => {
    // A progress bar and a 2px dot. 1.4.11 territory, no glyph or label.
    for (const f of [
      "src/components/admin/UndoToast.tsx",
      "src/components/profile/panels/ComingSoonPanel.tsx",
    ]) {
      expect(read(f)).not.toContain("text-bcc-on-accent");
    }
  });

  it("no measurement harness was left behind", () => {
    // The auth-gated sites were proved through a temporary route that
    // rendered their exact class strings. It must not have shipped.
    expect(() => read("src/app/zz-slice-b-harness/page.tsx")).toThrow();
  });
});
