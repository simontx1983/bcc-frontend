/**
 * Testnet UX audit B2 — the validator page's claim buttons were drawn with a
 * fixed `bg-ink`, so in dark mode CLAIM THIS PAGE (and the signed-out SIGN
 * IN TO CLAIM) sat near-black on a near-black page: the entry to the whole
 * claim journey all but disappeared. Both now use the shared primary button
 * (`.bcc-btn .bcc-btn-primary`: the accent fill with its on-accent text,
 * built for both themes), with a 44px tap target.
 *
 * A class can't be measured in jsdom, so this reads the source, as the
 * repo's other token guards do.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const src = readFileSync(resolve(process.cwd(), "src/components/claim/ClaimCallout.tsx"), "utf-8");

/** The className of the element whose text is `label`. */
function classOf(label: string): string {
  const at = src.indexOf(label);
  expect(at, `${label} not found`).toBeGreaterThan(-1);
  const before = src.slice(0, at);
  const cls = before.slice(before.lastIndexOf("className=")).match(/className="([^"]*)"/)?.[1];
  expect(cls, `${label} has no className`).toBeDefined();
  return cls!;
}

describe("the claim buttons read in both themes", () => {
  for (const label of ["CLAIM THIS PAGE →", "SIGN IN TO CLAIM →"]) {
    it(label, () => {
      const cls = classOf(label);
      expect(cls).toMatch(/\bbcc-btn\b/);
      expect(cls).toMatch(/\bbcc-btn-primary\b/);
      expect(cls).toMatch(/min-h-\[44px\]/);
      // The fixed ink fill is what vanished on the dark page.
      expect(cls).not.toMatch(/\bbg-ink\b/);
    });
  }
});
