import { describe, expect, it } from "vitest";

import { safeCallbackPath } from "@/lib/auth/safe-callback";

/**
 * Open-redirect guard. The whole point is that ONLY same-origin internal
 * paths survive; anything that a browser could resolve off-origin must
 * return null so the caller falls back to its safe default route.
 */
describe("safeCallbackPath", () => {
  it("accepts a plain internal path", () => {
    expect(safeCallbackPath("/watching")).toBe("/watching");
    expect(safeCallbackPath("/u/handle?tab=disputes")).toBe("/u/handle?tab=disputes");
    expect(safeCallbackPath("/")).toBe("/");
  });

  it.each([
    ["null", null],
    ["undefined", undefined],
    ["empty string", ""],
    ["absolute http", "https://evil.example/phish"],
    ["protocol-relative", "//evil.example"],
    ["backslash-folded", "/\\evil.example"],
    ["leading backslash", "\\evil.example"],
    ["whitespace newline", "/ok\nhref=evil"],
    ["bare word (no leading slash)", "watching"],
    ["javascript scheme", "javascript:alert(1)"],
  ])("rejects %s -> null", (_label, input) => {
    expect(safeCallbackPath(input)).toBeNull();
  });
});
