/**
 * F-582: every page that hands an auth response to signIn("bcc-verified")
 * carries BOTH display flags. They travel the same path, so a sign-in page
 * that passes `can_moderate` but forgets `suspended` would sign a suspended
 * member in with no notice. Found by search rather than a hardcoded list,
 * so a new sign-in page is checked too.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function filesCalling(fn: string): string[] {
  const out = execFileSync("git", ["grep", "-l", "--untracked", `${fn}(`, "--", "src"], {
    encoding: "utf-8",
    cwd: process.cwd(),
  });
  return out
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s !== "" && !s.includes(".test.") && !s.startsWith("src/lib/auth/"));
}

describe("sign-in pages carry both display flags", () => {
  const sites = filesCalling("canModerateCredential");

  it("finds the sign-in pages at all", () => {
    expect(sites.length, "no canModerateCredential call sites found — the search is broken").toBeGreaterThanOrEqual(4);
  });

  it("every site that passes can_moderate also passes suspended", () => {
    for (const file of sites) {
      const src = readFileSync(resolve(process.cwd(), file), "utf-8");
      const moderate = (src.match(/\.\.\.canModerateCredential\(/g) ?? []).length;
      const suspended = (src.match(/\.\.\.suspendedCredential\(/g) ?? []).length;
      expect(suspended, `${file}: ${moderate} can_moderate credential(s) but ${suspended} suspended`).toBe(moderate);
    }
  });
});
