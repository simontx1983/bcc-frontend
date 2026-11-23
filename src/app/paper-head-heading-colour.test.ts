/**
 * F-544: a paper head's title was near-invisible in the light theme.
 *
 * `.bcc-paper-head` is the ink bar across the top of a paper sheet, and it
 * sets its text to cardstock. But the base heading rule
 * (`h1, h2, h3 { color: var(--bcc-text) }`) colours headings directly, so
 * an `<h3>` inside the bar never inherited the cardstock. It took
 * --bcc-text, which is dark in the light theme: CardReviewsPanel's
 * "Reviews" and every other panel head's title, dark on black.
 *
 * jsdom applies no stylesheet cascade, so this pins the CSS source:
 *  - the bar sets cardstock on ink;
 *  - a later, more specific rule makes its headings inherit it;
 *  - every `.bcc-paper-head` in the components titles itself with an
 *    h1-h3 that carries no colour utility of its own (which would beat
 *    the inherit again).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { isTestFile, sourceFiles } from "@/app/source-tree.testing";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");
const css = read("src/app/globals.css").replace(/\r\n/g, "\n");

describe("F-544: a paper head's heading takes the bar's cardstock", () => {
  it("the cause: the base rule colours h1-h3 with --bcc-text", () => {
    expect(css).toMatch(/h1, h2, h3 \{[^}]*color: var\(--bcc-text\);/);
  });

  it("the bar is cardstock on ink", () => {
    expect(css).toMatch(/\.bcc-paper-head \{[^}]*background: var\(--ink\);[^}]*color: var\(--cardstock\);/);
  });

  it("its headings inherit that, in a rule after the base one", () => {
    const rule = /\.bcc-paper-head :is\(h1, h2, h3\) \{\s*color: inherit;\s*\}/;
    expect(css).toMatch(rule);
    const base = css.search(/h1, h2, h3 \{/);
    const fix = css.search(rule);
    expect(base).toBeGreaterThanOrEqual(0);
    expect(fix).toBeGreaterThan(base);
  });

  it("no paper head's title sets its own text colour", () => {
    const offenders: string[] = [];
    let heads = 0;
    for (const { rel: file, code: src } of sourceFiles()) {
      if (!file.endsWith(".tsx") || isTestFile(file)) continue;
      const re = /<header className="bcc-paper-head">\s*<(h[1-3])([^>]*)>/g;
      for (let m = re.exec(src); m !== null; m = re.exec(src)) {
        heads += 1;
        if (/\btext-(?:ink|bcc-text|cardstock|\[)/.test(m[2] ?? "")) offenders.push(`${file}: <${m[1]}${m[2]}>`);
      }
    }
    // The scan must find the heads it's guarding, or it passes over nothing.
    expect(heads).toBeGreaterThanOrEqual(8);
    expect(offenders).toEqual([]);
  });
});
