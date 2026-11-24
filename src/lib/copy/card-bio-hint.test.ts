/**
 * Structure A row 16: every editor whose text shows on a card tells the
 * writer so, and wires the hint to its field.
 *
 * Source-text assertions (the house idiom for structural guarantees): the
 * onboarding identity step and the new-community form both pull in
 * mutation hooks that a render would only mock away. Each must import its
 * shared constant, render it under its own id, and point its textarea's
 * aria-describedby at that id. The member BioEditor joins this list when
 * figma's #295 (which owns that file) lands.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { CARD_BIO_HINT, CARD_DESCRIPTION_HINT } from "@/lib/copy/card";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf-8");

const EDITORS: ReadonlyArray<readonly [file: string, constant: string, hintId: string, fieldId: string]> = [
  ["src/components/onboarding/IdentityStep.tsx", "CARD_BIO_HINT", "onb-bio-card-hint", "onb-bio"],
  [
    "src/app/(main)/(app)/communities/new/page.tsx",
    "CARD_DESCRIPTION_HINT",
    "community-description-card-hint",
    "community-description",
  ],
];

describe("the card-bio hint", () => {
  it("promises only the start, which is true on every card (1–3 lines; none on a phone's validator card)", () => {
    expect(CARD_BIO_HINT).toBe("The start of your bio shows on your card.");
    expect(CARD_DESCRIPTION_HINT).toBe("The start of the description shows on the community's card.");
    for (const hint of [CARD_BIO_HINT, CARD_DESCRIPTION_HINT]) expect(hint).not.toMatch(/\d|words/);
  });

  it.each(EDITORS)("%s shows %s and describes its field with it", (file, constant, hintId, fieldId) => {
    const src = read(file);
    expect(src).toContain(`import { ${constant} } from "@/lib/copy/card";`);
    expect(src).toMatch(new RegExp(`id="${hintId}"[^>]*>\\s*\\{${constant}\\}`));
    expect(src).toMatch(new RegExp(`<textarea[^>]*id="${fieldId}"[^>]*aria-describedby="${hintId}"`));
    // Never a private copy of the words.
    expect(src).not.toContain("shows on your card");
    expect(src).not.toContain("first 25 words");
  });
});
