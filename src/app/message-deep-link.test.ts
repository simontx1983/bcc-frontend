/**
 * `?to_user=` / `?to_page=` parsing.
 *
 * The rule this file exists to pin: validate the WHOLE string before
 * converting. The previous idiom was `Number.parseInt(raw, 10)` guarded by
 * `Number.isFinite(parsed) && parsed > 0`, which is a PREFIX parse —
 * parseInt("1e9", 10) is 1, so "1e9", "12abc" and "+12" all resolved to a
 * real user id. Anything accepted here becomes a conversation recipient.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const SRC = readFileSync(
  resolve(process.cwd(), "src/app/(main)/(app)/messages/new/page.tsx"),
  "utf-8",
);

/**
 * The shipped validator, mirrored. Kept in lockstep by the source assertions
 * below — the page's own copy runs inside a client component that would drag
 * NextAuth and React Query into this test for no benefit.
 */
function readPositiveIntParam(search: URLSearchParams, name: string): number | null {
  const all = search.getAll(name);
  if (all.length !== 1) return null;
  const raw = all[0];
  if (raw === undefined) return null;
  if (!/^[1-9][0-9]*$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

const parse = (qs: string, name = "to_user") =>
  readPositiveIntParam(new URLSearchParams(qs), name);

describe("accepts only a plain positive integer", () => {
  it.each([
    ["1", 1],
    ["42", 42],
    ["9007199254740991", 9007199254740991],
  ])("accepts %s", (raw, expected) => {
    expect(parse(`to_user=${raw}`)).toBe(expected);
  });
});

describe("rejects everything else", () => {
  it.each([
    ["missing", ""],
    ["empty", "to_user="],
    ["whitespace", "to_user=%20"],
    ["padded", "to_user=%2012%20"],
    ["zero", "to_user=0"],
    ["leading zero", "to_user=012"],
    ["negative", "to_user=-1"],
    ["signed", "to_user=%2B12"],
    ["decimal", "to_user=1.5"],
    ["exponential", "to_user=1e9"],
    ["mixed text", "to_user=12abc"],
    ["pure text", "to_user=abc"],
    ["hex", "to_user=0x1f"],
    ["infinity", "to_user=Infinity"],
    ["NaN", "to_user=NaN"],
    ["unsafe integer", "to_user=9007199254740993"],
  ])("rejects %s", (_label, qs) => {
    expect(parse(qs)).toBeNull();
  });

  it("rejects a REPEATED parameter instead of guessing", () => {
    // URLSearchParams.get would silently return the first value, so
    // ?to_user=1&to_user=2 would quietly address user 1.
    expect(new URLSearchParams("to_user=1&to_user=2").get("to_user")).toBe("1");
    expect(parse("to_user=1&to_user=2")).toBeNull();
  });
});

describe("the shipped page uses this validator, not a prefix parse", () => {
  it("validates the whole string with an anchored pattern", () => {
    expect(SRC).toMatch(/\/\^\[1-9\]\[0-9\]\*\$\//);
    expect(SRC).toContain("Number.isSafeInteger");
  });

  it("reads getAll, never a bare get, for the pinned ids", () => {
    expect(SRC).toContain("searchParams.getAll(name)");
    expect(SRC).not.toMatch(/searchParams\.get\(["']to_user["']\)/);
    expect(SRC).not.toMatch(/searchParams\.get\(["']to_page["']\)/);
  });

  it("has no Number.parseInt prefix parse left", () => {
    // A CALL, not a mention — the validator's own docblock names parseInt to
    // explain why it is unusable here, and that sentence is worth keeping.
    expect(SRC).not.toMatch(/Number\.parseInt\s*\(/);
  });

  it("routes both pins through the same validator", () => {
    expect(SRC).toContain('readPositiveIntParam(searchParams, "to_page")');
    expect(SRC).toContain('readPositiveIntParam(searchParams, "to_user")');
  });
});

describe("validator deep-link behaviour is preserved", () => {
  it("still requires to_kind=validator for a page pin", () => {
    expect(SRC).toMatch(/to_kind["']\)\s*===\s*["']validator["']/);
  });

  it("still sends a pinned PAGE as page_id, not a resolved operator", () => {
    expect(SRC).toContain("mutation.mutate({ page_id: pinnedCard.id, body: trimmed })");
  });

  it("sends a pinned MEMBER through the existing recipient_id branch", () => {
    expect(SRC).toContain("recipient_id: person.id");
  });

  it("re-checks card_kind on both pins so a cleared pin cannot resurrect", () => {
    expect(SRC).toContain('pinnedQuery.data.card_kind === "validator"');
    expect(SRC).toContain('pinnedUserQuery.data.card_kind === "member"');
  });
});
