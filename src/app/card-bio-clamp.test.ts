/**
 * The card front bio's clamps (structure A row 16) are measured numbers:
 * with the 108px crest kept, the portrait has room for 3 lines on most
 * cards and 1 on a validator card (its on-chain strip), and on the narrow
 * card (≤380px) for 1 line, or none on a validator card. Those numbers
 * only hold at the metrics they were measured with, and only if the
 * phone clamps switch at exactly the width the card itself narrows. This
 * pins both.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf-8").replace(/\r\n/g, "\n");

/** The body of the first `selector {` rule found after `from`. */
function rule(selector: string, from = 0): { body: string; at: number } {
  const at = css.indexOf(`${selector} {`, from);
  expect(at, `${selector} not found`).toBeGreaterThan(-1);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return { body: css.slice(open + 1, close), at };
}

/** Every `@media (…) { … }` block (one nesting level), with its query. */
function mediaBlocks(): Array<{ query: string; body: string }> {
  const out: Array<{ query: string; body: string }> = [];
  const re = /@media\s*([^{]+)\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < css.length && depth > 0; i++) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
    }
    out.push({ query: (m[1] ?? "").trim(), body: css.slice(re.lastIndex, i - 1) });
  }
  return out;
}

describe("card front bio clamps", () => {
  it("is set at the measured metrics: 13px, line-height 1.4, 6px top padding, 3 lines", () => {
    const { body } = rule(".bcc-card-bio");
    expect(body).toMatch(/font-size:\s*13px;/);
    expect(body).toMatch(/line-height:\s*1\.4;/);
    expect(body).toMatch(/padding:\s*6px 16px 0;/);
    expect(body).toMatch(/-webkit-line-clamp:\s*3;/);
    expect(body).toMatch(/overflow:\s*hidden;/);
    expect(body).toMatch(/flex-shrink:\s*0;/);
  });

  it("a tight card (the on-chain strip) gets 1 line", () => {
    const { body } = rule('.bcc-card-bio[data-room="tight"]');
    expect(body).toMatch(/-webkit-line-clamp:\s*1;/);
  });

  it("on the narrow card: 1 line, and none on a tight card, under the SAME query that narrows the card", () => {
    const blocks = mediaBlocks();
    const narrowCard = blocks.find((b) => /\.bcc-card\s*\{[^}]*max-width:\s*296px/.test(b.body));
    expect(narrowCard, "the narrow .bcc-card rule").toBeDefined();
    const phoneBio = blocks.find((b) => b.body.includes(".bcc-card-bio"));
    expect(phoneBio, "the phone .bcc-card-bio rule").toBeDefined();
    expect(phoneBio?.query).toBe(narrowCard?.query);
    expect(phoneBio?.body).toMatch(/\.bcc-card-bio\s*\{[^}]*-webkit-line-clamp:\s*1;/);
    expect(phoneBio?.body).toMatch(/\.bcc-card-bio\[data-room="tight"\]\s*\{[^}]*display:\s*none;/);
  });
});
