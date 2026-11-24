import { describe, expect, it } from "vitest";

import { PUSH_READ_MAX_IDS, parsePushReadIds } from "@/lib/push/push-read-ids";

describe("parsePushReadIds (F-516)", () => {
  it("takes a list of positive integers, de-duplicated in order", () => {
    expect(parsePushReadIds([21, 22, 21, 23])).toEqual([21, 22, 23]);
  });

  it("takes the query param's comma-separated digits", () => {
    expect(parsePushReadIds("21,22,22")).toEqual([21, 22]);
  });

  it("takes exactly the cap", () => {
    const ids = Array.from({ length: PUSH_READ_MAX_IDS }, (_, i) => i + 1);
    expect(parsePushReadIds(ids)).toEqual(ids);
    expect(PUSH_READ_MAX_IDS).toBe(50);
  });

  it.each([
    ["an empty list", []],
    ["an empty string", ""],
    ["one id too many", Array.from({ length: PUSH_READ_MAX_IDS + 1 }, (_, i) => i + 1)],
    ["a zero", [5, 0]],
    ["a negative", [5, -2]],
    ["a fraction", [1.5]],
    ["a leading zero", "05"],
    ["a sign", "+5"],
    ["a word", "5,abc"],
    ["an empty slot", "5,,6"],
    ["a nested list", [[5]]],
    ["null", null],
    ["undefined", undefined],
    ["an object", { ids: [5] }],
    ["an unsafe integer", [Number.MAX_SAFE_INTEGER + 1]],
  ])("refuses %s, so nothing is marked", (_label, raw) => {
    expect(parsePushReadIds(raw)).toBeNull();
  });
});
