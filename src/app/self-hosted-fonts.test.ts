/**
 * The brand fonts are self-hosted with next/font/local (#243), so a build
 * never fetches from Google.
 *
 * next/font/local registers each face under a generated family name and
 * publishes it through the --font-* variable it sets on <html>. A literal
 * family name anywhere in the CSS (as globals.css once had in :root, e.g.
 * `--font-stencil: 'Big Shoulders Stencil'`) matches NO self-hosted face,
 * and every heading silently falls back to Impact. The preview of #243
 * shipped exactly that until this guard existed.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const LAYOUT_PATH = resolve(process.cwd(), "src/app/layout.tsx");
const LAYOUT = readFileSync(LAYOUT_PATH, "utf-8");
const CSS = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8");

const VARS = ["--font-stencil", "--font-serif", "--font-mono", "--font-script"];

describe("self-hosted brand fonts", () => {
  it("the layout never loads fonts from Google", () => {
    expect(LAYOUT).not.toContain("next/font/google");
    expect(LAYOUT).toContain('from "next/font/local"');
  });

  it.each(VARS)("%s is set by next/font, never redefined in globals.css", (v) => {
    expect(LAYOUT).toContain(`variable: "${v}"`);
    // A declaration (`--font-x: …`), not a use (`var(--font-x)`).
    expect(CSS).not.toMatch(new RegExp(`(^|[;{\\s])${v}\\s*:`, "m"));
  });

  it("every font file the layout names is committed, with its licence", () => {
    const paths = [...LAYOUT.matchAll(/path:\s*"(\.\/fonts\/[^"]+\.woff2)"/g)].map((m) => m[1] as string);
    expect(paths.length).toBe(5);
    for (const p of paths) {
      expect(existsSync(resolve(dirname(LAYOUT_PATH), p))).toBe(true);
    }
    for (const licence of [
      "OFL-BigShouldersStencil.txt",
      "OFL-Fraunces.txt",
      "OFL-JetBrainsMono.txt",
      "LICENSE-HomemadeApple.txt",
    ]) {
      expect(existsSync(resolve(dirname(LAYOUT_PATH), "fonts", licence))).toBe(true);
    }
  });
});
