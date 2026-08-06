import { describe, expect, it } from "vitest";

import { publicDisplayNameOrEmpty } from "@/lib/format";

/**
 * Client mirror of the server display-name hygiene gate (2026-08-06).
 * The server (AuthSupport::sanitizePublicDisplayName) is the
 * authority; this pins the mirror so the two can't silently drift —
 * email-shaped and internal-login-shaped values must collapse to ""
 * (OAuth falls back to the handle; forms show a local error).
 */
describe("publicDisplayNameOrEmpty", () => {
  it.each([
    ["someone@example.com"],
    ["  a@b.io  "],
    ["hi @there"],
    ["u_claudeai"],
    [""],
    ["   "],
    [null],
    [undefined],
  ])("collapses leaky value %p to empty", (value) => {
    expect(publicDisplayNameOrEmpty(value as string | null | undefined)).toBe("");
  });

  it.each([
    ["Simon", "Simon"],
    ["  Cosmos Operator ", "Cosmos Operator"],
    ["unusual", "unusual"],
    ["Пётр", "Пётр"],
  ])("passes clean value %p trimmed", (value, expected) => {
    expect(publicDisplayNameOrEmpty(value)).toBe(expected);
  });
});
