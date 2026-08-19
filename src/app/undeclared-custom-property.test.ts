/**
 * Undeclared custom properties — the silent-colour failure.
 *
 * `AuthorVouchButton` coloured its vouch error message with
 * `text-[color:var(--danger)]`. `--danger` is declared NOWHERE in this
 * repo: the token is `--bcc-danger`, and the aesthetic namespace
 * (`--ink`, `--safety`, `--verified`, …) never aliased it. An undefined
 * custom property is *invalid at computed-value time*; for an inherited
 * property like `color` that resolves to `inherit`, so the error text
 * rendered in ordinary body colour. Nothing looked broken — the "this
 * failed" signal was just gone.
 *
 * That is the whole failure mode: a missing declaration costs you a
 * colour with no error, no warning and no visual smoking gun. So the
 * guard is not "don't write `--danger`" but the general invariant:
 *
 *   every `var(--x)` in the component layer resolves to a property this
 *   repo actually declares, unless it supplies a fallback.
 *
 * `var(--x, fallback)` is legitimate and deliberately allowed — it is how
 * caller-supplied properties (`--card-kind`, `--pill-color`, `--stagger`,
 * `--bcc-onboarding-delay`) are consumed.
 *
 * ## Scope, and the one thing knowingly outside it
 *
 * The strict invariant is asserted over `.ts`/`.tsx` (the component
 * layer). `globals.css` currently has a sibling instance of exactly this
 * bug — nine `var(--bcc-text-primary)` references in the auth/onboarding
 * rules, where the declared token is `--bcc-text` — which belongs to its
 * own slice, not this one. Rather than pin that count (a test that
 * asserts a defect stays broken is worse than no test), the CSS side is
 * guarded for *new kinds* only: any undeclared property other than the
 * one known name fails immediately, and fixing the known one does not
 * break anything here.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = resolve(process.cwd(), "src");
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const CSS = read("src/app/globals.css");

// ─────────────────────────────────────────────────────────────────────────
// Corpus
// ─────────────────────────────────────────────────────────────────────────

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    // Test files are excluded: they carry deliberate broken fixtures.
    else if (/\.(tsx?|css)$/.test(e.name) && !/\.(test|spec)\./.test(e.name)) out.push(full);
  }
  return out;
}

interface SourceFile {
  path: string;
  code: string;
  isCode: boolean;
}

/** Comment-stripped: a property named in prose is documentation, not a use. */
const FILES: readonly SourceFile[] = walk(SRC).map((f) => {
  const path = f.slice(SRC.length + 1).replace(/\\/g, "/");
  return {
    path,
    isCode: /\.tsx?$/.test(path),
    code: readFileSync(f, "utf-8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(?<!:)\/\/.*$/gm, ""),
  };
});

// ─────────────────────────────────────────────────────────────────────────
// The detector
// ─────────────────────────────────────────────────────────────────────────

/**
 * Every way this repo DECLARES a custom property:
 *   CSS rule            `--foo: #fff;`
 *   JSX style object    `"--foo": value` / `["--foo"]: value`
 *   imperative          `el.style.setProperty("--foo", …)`
 */
function declaredProperties(files: readonly SourceFile[]): Set<string> {
  const out = new Set<string>();
  for (const f of files) {
    for (const m of f.code.matchAll(/(?:^|[;{\s(])(--[a-zA-Z0-9_-]+)\s*:/g)) out.add(m[1] ?? "");
    for (const m of f.code.matchAll(/["'`](--[a-zA-Z0-9_-]+)["'`]\s*\]?\s*:/g)) out.add(m[1] ?? "");
    for (const m of f.code.matchAll(/setProperty\(\s*["'`](--[a-zA-Z0-9_-]+)["'`]/g)) out.add(m[1] ?? "");
  }
  return out;
}

interface VarRef {
  name: string;
  site: string;
  /** `var(--x, y)` — a missing declaration is survivable, so not a defect. */
  hasFallback: boolean;
}

function varRefs(path: string, code: string): VarRef[] {
  const out: VarRef[] = [];
  code.split(/\r?\n/).forEach((line, i) => {
    for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*([,)])/g)) {
      out.push({ name: m[1] ?? "", site: `${path}:${i + 1}`, hasFallback: m[2] === "," });
    }
  });
  return out;
}

/** References that resolve to nothing and have no fallback to fall back on. */
function undeclared(files: readonly SourceFile[], declared: Set<string>): VarRef[] {
  return files
    .flatMap((f) => varRefs(f.path, f.code))
    .filter((r) => !r.hasFallback && !declared.has(r.name));
}

const DECLARED = declaredProperties(FILES);
const ALL_REFS = FILES.flatMap((f) => varRefs(f.path, f.code));

// ─────────────────────────────────────────────────────────────────────────
// 1. The scan proves itself
// ─────────────────────────────────────────────────────────────────────────

describe("undeclared-property scan — preconditions", () => {
  it("walked a real, non-empty source tree", () => {
    expect(FILES.length).toBeGreaterThan(400);
    expect(FILES.some((f) => f.path === "app/globals.css")).toBe(true);
    expect(FILES.some((f) => f.path === "components/identity/AuthorVouchButton.tsx")).toBe(true);
  });

  it("found a real declaration set and a real reference set", () => {
    expect(DECLARED.size).toBeGreaterThan(150);
    expect(ALL_REFS.length).toBeGreaterThan(1000);
    expect(ALL_REFS.filter((r) => /\.tsx?:/.test(r.site)).length).toBeGreaterThan(300);
  });

  it("collects declarations from CSS, JSX style objects and setProperty alike", () => {
    expect(DECLARED.has("--bcc-danger")).toBe(true); // CSS rule
    expect(DECLARED.has("--bcc-vouch-particle-x")).toBe(true); // JSX style key
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Mutation controls — the detector is not scanning nothing
// ─────────────────────────────────────────────────────────────────────────

describe("the detector flags what it must and ignores what it must not", () => {
  const fixture = (code: string): SourceFile[] => [{ path: "fixture.tsx", code, isCode: true }];
  const withDeclared = new Set(["--bcc-danger", "--kind-member"]);

  const MUST_FLAG: ReadonlyArray<readonly [string, string]> = [
    ["the shipped defect verbatim", `className="text-[color:var(--danger)]"`],
    ["bare tailwind arbitrary value", `className="text-[var(--nope)]"`],
    ["inline style object", `style={{ color: "var(--nope)" }}`],
    ["css declaration", `.x { color: var(--nope); }`],
    ["whitespace inside var()", `color: var( --nope )`],
    ["nested inside a gradient", `background: linear-gradient(90deg, var(--nope), transparent)`],
  ];

  for (const [label, sample] of MUST_FLAG) {
    it(`flags: ${label}`, () => {
      expect(undeclared(fixture(sample), withDeclared)).toHaveLength(1);
    });
  }

  const MUST_NOT_FLAG: ReadonlyArray<readonly [string, string]> = [
    ["a declared token", `className="text-[var(--bcc-danger)]"`],
    ["an undeclared name WITH a fallback", `color: var(--nope, var(--bcc-danger))`],
    ["a fallback to a literal", `color: var(--nope, #dc2626)`],
    ["a property declared in the same file", `.x { --local: red; color: var(--local); }`],
    ["a JSX-declared property consumed in CSS", `style={{ "--local": "4px" }}; width: var(--local)`],
    ["a token named in prose only", `/* --nope is documented here, not used */`],
  ];

  for (const [label, sample] of MUST_NOT_FLAG) {
    it(`ignores: ${label}`, () => {
      const files = fixture(sample.replace(/\/\*[\s\S]*?\*\//g, ""));
      const declared = new Set([...withDeclared, ...declaredProperties(files)]);
      expect(undeclared(files, declared)).toEqual([]);
    });
  }

  it("re-introducing the defect into the REAL file is caught (2 substitutions)", () => {
    const original = read("src/components/identity/AuthorVouchButton.tsx");
    const mutated = original.split("var(--bcc-danger)").join("var(--danger)");
    // Assert the substitution actually happened, and how many times: a
    // mutation control that silently substitutes nothing proves nothing.
    const count = original.split("var(--bcc-danger)").length - 1;
    expect(count, "mutation control substituted nothing").toBe(2);
    expect(mutated).not.toBe(original);

    const clean = [{ path: "AuthorVouchButton.tsx", code: original, isCode: true }];
    const broken = [{ path: "AuthorVouchButton.tsx", code: mutated, isCode: true }];
    expect(undeclared(clean, DECLARED)).toEqual([]);
    const hits = undeclared(broken, DECLARED);
    expect(hits).toHaveLength(2);
    expect(hits.every((h) => h.name === "--danger")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. THE INVARIANT
// ─────────────────────────────────────────────────────────────────────────

describe("every var() in the component layer resolves", () => {
  it("no .ts/.tsx file references an undeclared property without a fallback", () => {
    const hits = undeclared(FILES.filter((f) => f.isCode), DECLARED);
    expect(
      hits.map((h) => `${h.name} @ ${h.site}`),
      "undefined custom property in a style position — it will compute to `unset`",
    ).toEqual([]);
  });

  it("no NEW kind of undeclared property appears in the stylesheets", () => {
    // `--bcc-text-primary` is a known, separately-owned instance of this same
    // bug (see the header). Excluding it by NAME rather than by count means
    // fixing it cannot break this test, while any new name fails at once.
    const KNOWN_CSS_GAP = "--bcc-text-primary";
    const hits = undeclared(FILES.filter((f) => !f.isCode), DECLARED)
      .filter((h) => h.name !== KNOWN_CSS_GAP);
    expect(hits.map((h) => `${h.name} @ ${h.site}`)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. The vouch error message specifically
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
/** Flatten a translucent surface onto what is behind it before measuring. */
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

describe("the vouch error message reads as an error", () => {
  const SRC_FILE = read("src/components/identity/AuthorVouchButton.tsx");

  it("both error spans use the declared danger token", () => {
    const hits = SRC_FILE.split("text-[var(--bcc-danger)]").length - 1;
    expect(hits, "expected the card and byline error spans").toBe(2);
    expect(SRC_FILE).not.toContain("var(--danger)");
    expect(SRC_FILE).not.toContain("--ink-danger");
  });

  it("the spans keep their assistive-tech announcement", () => {
    expect(SRC_FILE.split('role="status"').length - 1).toBe(2);
  });

  it("--bcc-danger is theme-scoped: one base, one light, two dark", () => {
    expect(decls("bcc-danger")).toEqual(["#ef4444", "#dc2626", "#ef4444", "#ef4444"]);
  });

  it("clears 4.5:1 on every surface these errors land on", () => {
    const light = "#dc2626";
    const dark = "#ef4444";

    // Byline variant: feed cards, post detail, the Lightbox rail — all
    // `.bcc-panel` / `bg-[var(--bcc-surface)]`.
    expect(ratio(light, "#ffffff")).toBeGreaterThanOrEqual(4.5); // 4.83
    expect(ratio(dark, "#161b22")).toBeGreaterThanOrEqual(4.5); // 4.60

    // Card variant: the glass author panel — 82% surface over the page bg,
    // which must be composited before it can be measured.
    expect(ratio(light, over("#ffffff", "#ffffff", 0.82))).toBeGreaterThanOrEqual(4.5); // 4.83
    expect(ratio(dark, over("#161b22", "#0d1117", 0.82))).toBeGreaterThanOrEqual(4.5); // 4.69
  });

  it("the compositing helper is doing real work", () => {
    // A control on the maths itself: 82% of #161b22 over #0d1117 is neither
    // endpoint, and a fully opaque composite is the foreground exactly.
    expect(over("#161b22", "#0d1117", 0.82)).toBe("#141920");
    expect(over("#161b22", "#0d1117", 1)).toBe("#161b22");
    expect(over("#161b22", "#0d1117", 0)).toBe("#0d1117");
    expect(Math.round(ratio("#dc2626", "#ffffff") * 100) / 100).toBe(4.83);
  });
});
