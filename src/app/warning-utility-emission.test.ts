/**
 * A Tailwind colour utility only exists if its key exists. `text-warning` did
 * not, and compiled to nothing.
 *
 * There is no bare `warning` key in the Tailwind theme — only `bcc-warning`.
 * So `text-warning` produced **zero** CSS rules while `.text-bcc-warning`
 * produced one. `counter-tone.ts` returned that dead class for its middle
 * rung, which meant the "near the limit" state of every three-rung character
 * counter silently inherited its colour: a three-rung ladder rendering as
 * two. Seven of the ten callers pass a `warnAt` and were affected.
 *
 * This is the second failure of this exact shape in the codebase. The first
 * was `/opacity` modifiers on a bare `var()` theme entry, which also emit
 * nothing. Both share a root cause: **a class name that looks plausible is
 * not evidence that a rule exists.**
 *
 * ## What this guard checks
 *
 * Not "does `text-warning` appear" — that is the symptom. It checks the
 * mechanism: every semantic colour utility used in production must name a
 * key that actually exists in the Tailwind theme. A future `text-danger`,
 * `bg-info` or `border-flag` typo fails here rather than shipping invisible.
 *
 * The audit found exactly ONE production no-op (`counter-tone.ts`). Three
 * other warning references were already correct and are pinned below so a
 * later "cleanup" does not convert a working form into a dead one:
 *
 *   PasswordStrengthMeter  inline `var(--bcc-warning)`      — real CSS
 *   FindingsSection        inline `var(--bcc-warning)`      — real CSS
 *   StandingFileBody       `text-[var(--bcc-warning)]`      — arbitrary value
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { counterToneClass } from "@/lib/counter-tone";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const TW = read("tailwind.config.ts");
const CSS = read("src/app/globals.css");
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

/** Comment-stripped, newline-preserving so reported lines stay true. */
const FILES = walk(SRC).map((f) => ({
  path: f.slice(SRC.length + 1).replace(/\\/g, "/"),
  code: readFileSync(f, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ""))
    .replace(/(?<!:)\/\/.*$/gm, ""),
}));

/**
 * Colour keys declared in the Tailwind theme. Both quoted (`"bcc-warning":`)
 * and bare (`safety:`) forms are used in this config, so both are collected.
 */
function themeColourKeys(): Set<string> {
  const keys = new Set<string>();
  for (const m of TW.matchAll(/^\s*"([a-z0-9-]+)":\s*["{]/gm)) keys.add(m[1] ?? "");
  for (const m of TW.matchAll(/^\s*([a-z][a-z0-9]*):\s*"/gm)) keys.add(m[1] ?? "");
  return keys;
}
const KEYS = themeColourKeys();

/** The semantic colour vocabulary this codebase paints with. */
const SEMANTIC = [
  "warning", "bcc-warning", "safety", "bcc-safety", "verified", "bcc-verified",
  "weld", "bcc-weld", "phosphor", "danger", "bcc-danger", "success", "bcc-success",
  "info", "bcc-info", "flag", "bcc-flag", "blueprint", "bcc-blueprint",
] as const;

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

// ─────────────────────────────────────────────────────────────────────────
// 1. Preconditions
// ─────────────────────────────────────────────────────────────────────────

describe("warning-utility emission — preconditions", () => {
  it("walked a real tree and parsed a real config", () => {
    expect(FILES.length).toBeGreaterThan(400);
    expect(TW).toContain("theme:");
  });

  it("the key parser found the config's colour keys", () => {
    // Non-zero floor: if this parser returns nothing, every membership
    // assertion below would vacuously pass.
    expect(KEYS.size).toBeGreaterThan(20);
    expect(KEYS.has("bcc-warning")).toBe(true); // quoted form
    expect(KEYS.has("safety")).toBe(true); // bare form
    expect(KEYS.has("verified")).toBe(true);
  });

  it("`warning` is NOT a key — the fact that caused the bug", () => {
    expect(KEYS.has("warning")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. The mechanism: no utility may name a key that does not exist
// ─────────────────────────────────────────────────────────────────────────

describe("every semantic colour utility names a real theme key", () => {
  it("no production file uses a utility whose key is missing", () => {
    const offenders: string[] = [];
    const UTIL = new RegExp(
      String.raw`(?:[a-z-]+:)?(?:text|bg|border|ring|decoration|outline|divide|placeholder|from|to|via)-(` +
        SEMANTIC.join("|") +
        String.raw`)(?:\/\d{1,3})?\b`,
      "g",
    );
    for (const f of FILES) {
      for (const [i, line] of f.code.split("\n").entries()) {
        for (const m of line.matchAll(UTIL)) {
          const key = m[1] ?? "";
          if (!KEYS.has(key)) offenders.push(`${f.path}:${i + 1} ${m[0]} (no "${key}" key)`);
        }
      }
    }
    expect(offenders, `utilities compiling to nothing:\n${offenders.join("\n")}`).toEqual([]);
  });

  it("specifically, no bare-`warning` utility survives anywhere", () => {
    const hits = FILES.flatMap((f) =>
      [...f.code.matchAll(/(?:[a-z-]+:)?(?:text|bg|border|ring)-warning\b/g)].map(
        (m) => `${f.path} ${m[0]}`,
      ),
    );
    expect(hits).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. The helper and its ten callers
// ─────────────────────────────────────────────────────────────────────────

describe("counterToneClass returns only classes that compile", () => {
  it("the middle rung is text-bcc-warning, not the dead text-warning", () => {
    expect(counterToneClass(50, 100, 40)).toBe("text-bcc-warning");
    expect(counterToneClass(50, 100, 40)).not.toBe("text-warning");
  });

  it("all three rungs name real theme keys", () => {
    const rungs = [
      counterToneClass(200, 100, 80), // over
      counterToneClass(90, 100, 80), // near
      counterToneClass(10, 100, 80), // under
    ];
    expect(rungs).toEqual(["text-safety", "text-bcc-warning", "text-bcc-text-secondary"]);
    for (const r of rungs) {
      const key = r.replace(/^text-/, "");
      expect(KEYS.has(key), `${r} names no theme key`).toBe(true);
    }
  });

  it("two-rung callers never reach the warning rung", () => {
    expect(counterToneClass(90, 100)).toBe("text-bcc-text-secondary");
    expect(counterToneClass(200, 100)).toBe("text-safety");
  });

  it("the three rungs are mutually distinguishable", () => {
    const [safety, warn, sec] = [
      decls("bcc-safety")[0] ?? "",
      decls("bcc-warning")[1] ?? "", // light
      "#4b5563",
    ];
    expect(ratio(safety, warn)).toBeGreaterThan(1.2);
    expect(ratio(warn, sec)).toBeGreaterThan(1.2);
  });

  it("the warning rung clears 4.5:1 in both themes", () => {
    expect(ratio(decls("bcc-warning")[1] ?? "", "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(ratio(decls("bcc-warning")[2] ?? "", "#0d1117")).toBeGreaterThanOrEqual(4.5);
  });
});

const CALLERS = [
  ["src/components/blog/BlogComposer.tsx", true],
  ["src/components/blog/BodyEditor.tsx", true],
  ["src/components/blog/SourcesField.tsx", false],
  ["src/components/blog/TitleInput.tsx", true],
  ["src/components/composer/Composer.tsx", true],
  ["src/components/disputes/OpenDisputeModal.tsx", true],
  ["src/components/feed/CommentDrawer.tsx", false],
  ["src/components/messages/MessageComposer.tsx", false],
] as const;

describe("all ten call sites across eight files", () => {
  it("the caller inventory is exactly ten sites in eight files", () => {
    const total = FILES.filter((f) => /counterToneClass\(/.test(f.code) && !f.path.startsWith("lib/"))
      .flatMap((f) => [...f.code.matchAll(/counterToneClass\(/g)]).length;
    expect(total).toBe(10); // Composer holds three
    expect(CALLERS).toHaveLength(8);
  });

  for (const [file, threeRung] of CALLERS) {
    it(`${file.split("/").pop()} ${threeRung ? "passes warnAt (3-rung)" : "omits warnAt (2-rung)"}`, () => {
      const src = read(file);
      expect(src).toContain("counterToneClass(");
      // A three-rung caller supplies a soft threshold; a two-rung one does not.
      // Balanced-paren extraction: a non-greedy `\)` stops at the first inner
      // bracket and truncates multi-line calls, which read as 2-rung.
      const calls: string[] = [];
      for (const m of src.matchAll(/counterToneClass\(/g)) {
        let depth = 0;
        const start = (m.index ?? 0) + m[0].length;
        for (let i = start; i < src.length && i < start + 400; i++) {
          const ch = src[i];
          if (ch === "(") depth++;
          else if (ch === ")") {
            if (depth === 0) {
              calls.push(src.slice(start, i));
              break;
            }
            depth--;
          }
        }
      }
      expect(calls.length, "no complete call extracted").toBeGreaterThan(0);
      // Count top-level commas only — nested calls carry their own.
      const topLevelArgs = (s: string) => {
        let d = 0,
          n = 1;
        for (const ch of s) {
          if (ch === "(" || ch === "[") d++;
          else if (ch === ")" || ch === "]") d--;
          else if (ch === "," && d === 0) n++;
        }
        return n;
      };
      const anyThree = calls.some((c) => topLevelArgs(c) >= 3);
      expect(anyThree).toBe(threeRung);
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// 4. The three already-correct forms stay correct
// ─────────────────────────────────────────────────────────────────────────

describe("the working warning references are not broken by a later tidy", () => {
  it("PasswordStrengthMeter uses an inline var(), which is real CSS", () => {
    expect(read("src/components/auth/PasswordStrengthMeter.tsx")).toContain("var(--bcc-warning)");
  });

  it("FindingsSection uses an inline var()", () => {
    expect(read("src/components/profile/FindingsSection.tsx")).toContain("var(--bcc-warning)");
  });

  it("StandingFileBody uses an arbitrary value, which does emit", () => {
    // `text-[var(--bcc-warning)]` compiles to
    // `.text-\[var\(--bcc-warning\)\] { color: var(--bcc-warning) }` — verified
    // against a build. Arbitrary values bypass the theme-key requirement.
    expect(read("src/components/profile/StandingFileBody.tsx")).toContain(
      "text-[var(--bcc-warning)]",
    );
  });

  it("--bcc-warning itself is unchanged and still theme-scoped", () => {
    expect(decls("bcc-warning")).toEqual(["#f59e0b", "#b45309", "#f59e0b", "#f59e0b"]);
  });

  it("safety and weld are untouched by this slice", () => {
    expect(decls("bcc-safety")).toEqual(["#f05a28"]);
    expect(decls("bcc-weld")).toEqual(["#ffc01e"]);
  });
});
