/**
 * F-426: smooth scrolling stops under `prefers-reduced-motion: reduce`.
 *
 * Two halves, both needed:
 *
 * 1. CSS. `html { scroll-behavior: smooth }` in `@layer base` had no
 *    reduced-motion override (the global reduced-motion block zeroed
 *    animations and transitions only), so every `#anchor` jump glided,
 *    and so did every `scrollIntoView({ behavior: "auto" })` whose
 *    scroller is the root, since "auto" means "use the CSS value". The
 *    reduced-motion block now sets `html { scroll-behavior: auto }`.
 *    It wins by source order: same layer, same specificity, later rule.
 *    jsdom applies no media queries, so this half is pinned on the parsed
 *    stylesheet (postcss), not on computed style.
 *
 * 2. JS. Script scrolls pick `behavior: reduced ? "auto" : "smooth"` from
 *    the shared usePrefersReducedMotion hook. Lightbox and WalletsSection
 *    are pinned behaviourally in their own test files; the ratchet below
 *    stops a new unconditional `behavior: "smooth"` from landing.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import postcss, { type AtRule, type Container, type Declaration, type Document, type Rule } from "postcss";
import { describe, expect, it } from "vitest";

const CSS_PATH = resolve(process.cwd(), "src/app/globals.css");
const ROOT = postcss.parse(readFileSync(CSS_PATH, "utf-8"), { from: CSS_PATH });

interface ScrollDecl {
  value: string;
  important: boolean;
  selector: string;
  /** Params of every enclosing @media, outermost first. */
  media: string[];
  /** Name of the enclosing @layer, or null when unlayered. */
  layer: string | null;
  /** Source order: the declaration's character offset in the file. */
  offset: number;
}

function enclosing(decl: Declaration): Pick<ScrollDecl, "media" | "layer"> {
  const media: string[] = [];
  let layer: string | null = null;
  let node: Container | Document | undefined = decl.parent;
  while (node !== undefined) {
    if (node.type === "atrule") {
      const at = node as AtRule;
      if (at.name === "media") media.unshift(at.params.trim());
      if (at.name === "layer" && layer === null) layer = at.params.trim();
    }
    node = node.parent as Container | Document | undefined;
  }
  return { media, layer };
}

const SCROLL_DECLS: ScrollDecl[] = [];
ROOT.walkDecls("scroll-behavior", (decl) => {
  const rule = decl.parent as Rule;
  SCROLL_DECLS.push({
    value: decl.value.trim(),
    // postcss leaves `important` undefined (not false) on a normal declaration.
    important: decl.important === true,
    selector: rule.type === "rule" ? rule.selector.trim() : "",
    ...enclosing(decl),
    offset: decl.source?.start?.offset ?? -1,
  });
});

const REDUCE = "(prefers-reduced-motion: reduce)";
const NO_PREFERENCE = "(prefers-reduced-motion: no-preference)";

describe("globals.css — scroll-behavior under reduced motion (F-426)", () => {
  const smoothDefault = SCROLL_DECLS.find(
    (d) => d.selector === "html" && d.value === "smooth" && d.media.length === 0,
  );
  const reducedOverride = SCROLL_DECLS.find(
    (d) => d.selector === "html" && d.value === "auto" && d.media.includes(REDUCE),
  );

  it("keeps the no-preference default: html glides, in @layer base, without !important", () => {
    expect(smoothDefault).toBeDefined();
    expect(smoothDefault?.layer).toBe("base");
    // An !important smooth would beat the normal override below.
    expect(smoothDefault?.important).toBe(false);
  });

  it("sets html back to auto inside the reduced-motion media query", () => {
    expect(reducedOverride).toBeDefined();
  });

  it("the override sits in the same layer and AFTER the default, so it wins by source order", () => {
    expect(reducedOverride?.layer).toBe(smoothDefault?.layer);
    expect(reducedOverride?.offset ?? -1).toBeGreaterThan(smoothDefault?.offset ?? Infinity);
  });

  it("nothing else turns smooth scrolling on outside a no-preference query", () => {
    const others = SCROLL_DECLS.filter(
      (d) => d.value === "smooth" && d !== smoothDefault && !d.media.includes(NO_PREFERENCE),
    );
    expect(others).toEqual([]);
  });
});

// ── ratchet: no new unconditional smooth script scroll ─────────────────

const SRC = resolve(process.cwd(), "src");

/**
 * Files allowed to keep an unconditional smooth scroll, each with its reason.
 * PostDetail.tsx is out of F-426's scope: FE #326 (F-346) is already
 * rewriting that file and folds the same fix in. Drop the entry once it
 * lands; nothing fails while it lingers.
 */
const ALLOWED: Readonly<Record<string, string>> = {
  "components/feed/PostDetail.tsx": "fixed inside FE #326",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

/** A literal smooth behaviour, a Tailwind `scroll-smooth`, or an inline scrollBehavior. */
const UNCONDITIONAL_SMOOTH = [
  /\bbehavior\s*:\s*["'`]smooth["'`]/,
  /\bscrollBehavior\s*:\s*["'`]smooth["'`]/,
  /(^|[\s"'`])scroll-smooth(?=[\s"'`]|$)/,
];

// Scanned once at load (like dead-symbol-removal.test.ts): walking the
// whole tree inside a test can outrun the per-test timeout on a busy runner.
const OFFENDERS: string[] = [];
for (const file of walk(SRC)) {
  const path = file.slice(SRC.length + 1).replace(/\\/g, "/");
  if (path in ALLOWED) continue;
  // Comments stripped: prose that names the pattern is not a call.
  const code = readFileSync(file, "utf-8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(?<!:)\/\/.*$/gm, "");
  code.split(/\r?\n/).forEach((line, i) => {
    if (UNCONDITIONAL_SMOOTH.some((re) => re.test(line))) {
      OFFENDERS.push(`${path}:${i + 1}: ${line.trim()}`);
    }
  });
}

describe("ratchet — script scrolls ask for reduced motion (F-426)", () => {
  it("no source passes behavior: \"smooth\" unconditionally", () => {
    expect(OFFENDERS).toEqual([]);
  });

  it("its patterns catch a literal smooth and pass the conditional form", () => {
    // Guards the patterns themselves against silently matching nothing.
    const sample = 'el.scrollIntoView({ block: "center", behavior: "smooth" });';
    expect(UNCONDITIONAL_SMOOTH.some((re) => re.test(sample))).toBe(true);
    const conditional = 'el.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });';
    expect(UNCONDITIONAL_SMOOTH.some((re) => re.test(conditional))).toBe(false);
  });
});
