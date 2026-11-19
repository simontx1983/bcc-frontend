import { describe, expect, it } from "vitest";

import { isScript, isTestFile, sourceFiles } from "@/app/source-tree.testing";

/**
 * bcc-trust F-288: a 401 on a route that requires sign-in can carry
 * `bcc_token_expired` / `bcc_token_invalid` instead of `bcc_unauthorized`.
 * Sign-in copy goes through humanizeCode, which maps both onto a call
 * site's `bcc_unauthorized` entry. Any code that branches on
 * `bcc_unauthorized` by itself would silently miss them, so none may come
 * back — in any of the forms below.
 */

const Q = "[\"'`]";
const CODE = `${Q}bcc_unauthorized${Q}`;

/** Ways code can branch on the code string directly. */
const DIRECT_COMPARE: readonly RegExp[] = [
  // x === "bcc_unauthorized", x !== …, and loose == / !=
  new RegExp(`[!=]==?\\s*${CODE}`),
  // "bcc_unauthorized" === x — the reversed operand order
  new RegExp(`${CODE}\\s*[!=]==?`),
  // switch (err.code) { case "bcc_unauthorized": … }
  new RegExp(`\\bcase\\s+${CODE}\\s*:`),
  // isCode(err, "bcc_unauthorized") — errors.ts's exact-match helper
  new RegExp(`\\bisCode\\s*\\([^)]*${CODE}`),
];

function comparesDirectly(source: string): boolean {
  return DIRECT_COMPARE.some((re) => re.test(source));
}

describe("the direct-compare matcher", () => {
  it.each([
    ['err.code === "bcc_unauthorized"'],
    ["err.code === 'bcc_unauthorized'"],
    ["err.code !== \"bcc_unauthorized\""],
    ["err.code == \"bcc_unauthorized\""],
    ['"bcc_unauthorized" === err.code'],
    ['"bcc_unauthorized" !== err.code'],
    ['case "bcc_unauthorized":'],
    ["case `bcc_unauthorized` :"],
    ['isCode(error, "bcc_unauthorized")'],
    ["mutation.error.code ===\n      \"bcc_unauthorized\""],
  ])("catches %s", (snippet) => {
    expect(comparesDirectly(snippet)).toBe(true);
  });

  it.each([
    ['{ bcc_unauthorized: "Sign in again." }'],
    ["humanizeCode(err, { bcc_unauthorized: \"Sign in.\" }, \"Default.\")"],
    ["// a 401 is `bcc_unauthorized` from the endpoint"],
    ['err.code === "bcc_unauthorized_extra"'],
    ['isCode(err, "bcc_rate_limited")'],
  ])("leaves %s alone", (snippet) => {
    expect(comparesDirectly(snippet)).toBe(false);
  });
});

describe("no direct bcc_unauthorized comparisons in app code", () => {
  // The whole-src walk runs here, at collection, outside the test's timer
  // (F-449). It used to run inside the test, behind a 30s ceiling for a
  // loaded CI box; the test itself now only scans strings.
  const PRODUCTION = sourceFiles().filter((f) => isScript(f.rel) && !isTestFile(f.rel));

  it("routes sign-in copy through humanizeCode", () => {
    expect(PRODUCTION.length, "the source scan matched nothing").toBeGreaterThan(200);
    const offenders = PRODUCTION.filter((f) => comparesDirectly(f.code)).map((f) => f.rel);
    expect(offenders).toEqual([]);
  });
});
