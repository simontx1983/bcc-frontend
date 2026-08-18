/**
 * `--weld` is confined to fixed-dark chrome. Exactly two consumers moved.
 *
 * Weld (`#ffc01e`) is the hi-vis yellow of the paper-shop grammar. It is
 * chosen *because* its backdrop is fixed black: on `--ink #0f0d09` it reads
 * **11.84:1**. On a theme-aware light surface it reads **1.64:1**.
 *
 * ## Why weld is NOT theme-scoped, and never should be
 *
 * Nine of its eleven consumers sit on fixed-dark grounds and already pass at
 * 9.87–11.84. Theme-scoping would have to darken weld for light theme — but
 * those nine grounds do not flip, so the darkened value would land ON the
 * black bar and break them. Measured: `--bcc-warning` light (`#b45309`), the
 * nearest existing darkened amber, reads **3.87:1 on `--ink`** where weld
 * reads 11.84. A theme-scoped weld fails in exactly the same way.
 *
 * So the token keeps its value and loses only the two consumers that were on
 * the wrong surface to begin with.
 *
 * ## Why `--bcc-warning` and not `text-warning`
 *
 * `text-warning` emits NO CSS. There is no `warning` key in the Tailwind
 * config — only `bcc-warning`. A build against real content emits zero
 * `.text-warning` rules while emitting `.text-safety` and `.text-verified`
 * normally. The prior weld→warning migration in `counter-tone.ts` therefore
 * never took effect; that is a separate live defect with its own slice, and
 * this guard asserts the two sites here use the utility that actually emits.
 *
 * ## Why NftPickerModal lost its tint and its alpha border
 *
 * `bg-bcc-warning/10` and `border-bcc-warning/60` would both emit nothing —
 * `--bcc-warning` is bridged as a bare `var()`, which cannot carry an alpha
 * modifier. Full-alpha border it is. And `text-ink` had to go regardless: on
 * the dark panel it measured **1.12:1**, which was the actual cause of that
 * consumer's dark-theme failure, not the weld tint.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const CSS = read("src/app/globals.css");
const TW = read("tailwind.config.ts");
const SRC = resolve(process.cwd(), "src");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|css)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(full);
  }
  return out;
}
const FILES = walk(SRC).map((f) => ({
  path: f.slice(SRC.length + 1).replace(/\\/g, "/"),
  code: readFileSync(f, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!:)\/\/.*$/gm, ""),
}));

const decls = (n: string) =>
  [...CSS.matchAll(new RegExp(`--${n}:\\s*([^;]+);`, "g"))].map((m) => m[1]?.trim() ?? "");

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

/** The two that moved — both were on theme-aware surfaces and both failed. */
const MIGRATED = [
  "src/components/profile/TrustQuestShareAction.tsx",
  "src/components/onchain/NftPickerModal.tsx",
] as const;

/** The nine that stay — all on fixed-dark grounds, all already passing. */
const FIXED_DARK_WELD = [
  ["src/app/globals.css", ".bcc-caution-tape gradient"],
  ["src/app/globals.css", ".bcc-grade"],
  ["src/app/globals.css", '.bcc-pill[data-status="open"]'],
  ["src/components/disputes/CaseBody.tsx", "EXHIBIT A stamp"],
  ["src/components/entity/panels/CardReviewsPanel.tsx", "eyebrow"],
  ["src/components/profile/panels/ComingSoonPanel.tsx", "eyebrow"],
  ["src/components/profile/panels/DisputesPanel.tsx", "eyebrow"],
  ["src/components/profile/panels/GroupsPanel.tsx", "eyebrow"],
  ["src/components/profile/panels/ReviewsPanel.tsx", "eyebrow"],
] as const;

// ─────────────────────────────────────────────────────────────────────────
// 1. Preconditions
// ─────────────────────────────────────────────────────────────────────────

describe("weld confinement — preconditions", () => {
  it("walked a real, non-empty tree", () => {
    expect(FILES.length).toBeGreaterThan(400);
    expect(CSS.length).toBeGreaterThan(100_000);
  });

  it("the matcher finds weld where it still lives", () => {
    const withWeld = FILES.filter((f) => /text-weld|var\(--weld\)/.test(f.code));
    expect(withWeld.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Exactly two migrated, exactly nine remaining
// ─────────────────────────────────────────────────────────────────────────

describe("the consumer split is exactly 2 migrated / 9 remaining", () => {
  it("neither migrated file references weld any more", () => {
    for (const f of MIGRATED) {
      expect(read(f), `${f} still uses weld`).not.toMatch(
        /text-weld|bg-weld|border-weld|var\(--weld\)/,
      );
    }
  });

  it("repo-wide, weld survives in exactly the nine known sites", () => {
    // Nine textual sites across seven files: globals.css holds three
    // (tape gradient, .bcc-grade, the open pill) and the five component
    // eyebrows plus CaseBody make up the rest.
    const hits = FILES.flatMap((f) =>
      [...f.code.matchAll(/text-weld|bg-weld|border-weld|var\(--weld\)/g)].map(() => f.path),
    );
    expect(hits).toHaveLength(9);
    const files = [...new Set(hits)].sort();
    expect(files).toEqual([...new Set(FIXED_DARK_WELD.map(([p]) => p.replace("src/", "")))].sort());
  });

  it("every surviving consumer is one of the nine audited fixed-dark sites", () => {
    for (const [file] of FIXED_DARK_WELD) {
      expect(read(file)).toMatch(/text-weld|bg-weld|border-weld|var\(--weld\)/);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Both migrated sites use utilities that ACTUALLY EMIT
// ─────────────────────────────────────────────────────────────────────────

describe("the replacements are emitted utilities, not silent no-ops", () => {
  it("the Tailwind bridge exposes bcc-warning and NOT a bare `warning`", () => {
    expect(TW).toContain('"bcc-warning":          "var(--bcc-warning)"');
    // If a bare `warning` key is ever added, `text-warning` starts emitting
    // and the separate no-op bug is fixed — revisit this assertion then.
    expect(TW).not.toMatch(/^\s+warning:\s*"/m);
  });

  it("TrustQuestShareAction uses text-bcc-warning", () => {
    const src = read(MIGRATED[0]);
    expect(src).toContain("text-bcc-warning");
    expect(src).not.toMatch(/\btext-warning\b/); // the no-op form
  });

  it("NftPickerModal uses border-bcc-warning and text-bcc-text", () => {
    const src = read(MIGRATED[1]);
    expect(src).toContain("border border-bcc-warning");
    expect(src).toContain("text-bcc-text");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. NftPickerModal: no failing text-ink, no weld tint, no alpha border
// ─────────────────────────────────────────────────────────────────────────

describe("NftPickerModal's truncation notice", () => {
  const src = read(MIGRATED[1]);
  const NOTICE = /className="bcc-mono mb-4[^"]*"/.exec(src)?.[0] ?? "";

  it("the notice element is found", () => {
    expect(NOTICE).not.toBe("");
  });

  it("carries no text-ink — it measured 1.12:1 on the dark panel", () => {
    expect(NOTICE).not.toMatch(/\btext-ink\b/);
    expect(ratio("#0f0d09", "#161b22")).toBeLessThan(4.5); // why it had to go
  });

  it("carries no weld tint", () => {
    expect(NOTICE).not.toMatch(/bg-weld/);
    expect(NOTICE).not.toMatch(/border-weld/);
  });

  it("carries no alpha border — an alpha modifier on bcc-warning emits nothing", () => {
    expect(NOTICE).not.toMatch(/border-bcc-warning\/\d/);
    expect(NOTICE).not.toMatch(/bg-bcc-warning\/\d/);
  });

  it("clears its bars on the Dialog panel in both themes", () => {
    const [wLight, wDark] = [decls("bcc-warning")[1] ?? "", decls("bcc-warning")[2] ?? ""];
    const [tLight, tDark] = [decls("bcc-text")[0] ?? "", decls("bcc-text")[1] ?? ""];
    expect(ratio(tLight, "#ffffff")).toBeGreaterThanOrEqual(4.5); // text light
    expect(ratio(tDark, "#161b22")).toBeGreaterThanOrEqual(4.5); // text dark
    expect(ratio(wLight, "#ffffff")).toBeGreaterThanOrEqual(3); // border light
    expect(ratio(wDark, "#161b22")).toBeGreaterThanOrEqual(3); // border dark
  });
});

describe("TrustQuestShareAction's retry message", () => {
  it("clears 4.5:1 on the page background in both themes", () => {
    const [wLight, wDark] = [decls("bcc-warning")[1] ?? "", decls("bcc-warning")[2] ?? ""];
    expect(ratio(wLight, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(wDark, "#0d1117")).toBeGreaterThanOrEqual(4.5);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Weld definitions untouched
// ─────────────────────────────────────────────────────────────────────────

describe("weld's definitions are untouched", () => {
  it("all three spellings hold their original values, theme-blind", () => {
    expect(decls("bcc-weld")).toEqual(["#ffc01e"]);
    expect(decls("weld")).toEqual(["var(--bcc-weld)"]);
    expect(decls("weld-rgb")).toEqual(["255 192 30"]);
  });

  it("the Tailwind weld bridge is unchanged", () => {
    expect(TW).toContain('weld:      "rgb(var(--weld-rgb) / <alpha-value>)"');
  });

  it("weld still passes where it stayed — the reason it was not scoped", () => {
    expect(ratio("#ffc01e", "#0f0d09")).toBeGreaterThanOrEqual(4.5); // 11.84 on ink
    // …and the darkened alternative would have broken exactly those sites.
    expect(ratio("#b45309", "#0f0d09")).toBeLessThan(4.5); // 3.87
  });

  it("safety is untouched by this slice", () => {
    expect(decls("bcc-safety")).toEqual(["#f05a28"]);
    expect(decls("safety-rgb")).toEqual(["240 90 40"]);
  });
});
