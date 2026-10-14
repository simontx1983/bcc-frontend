/**
 * The bearer consistency check.
 *
 * ⚠ The property under test is NOT "does it read JWTs correctly". It is
 * **anything doubtful must produce a refusal**. This module can only ever
 * veto a success the caller would otherwise report, so every malformed,
 * missing, out-of-range or mismatched input has to come back as "fails the
 * check". A false veto costs one unnecessary "sign in again"; a false pass
 * tells someone their password change kept them signed in when it did not.
 */

import { describe, expect, it } from "vitest";

import {
  bearerFailsConsistencyCheck,
  readBearerConsistencyClaims,
  TOKEN_VERSION_MAX,
} from "@/lib/auth/bearer-claims";

/**
 * Base64url a claim set the way the server does: `wp_json_encode` produces
 * UTF-8 bytes and `b64urlEncode` encodes those bytes.
 *
 * ⚠ Not `btoa(JSON.stringify(...))` — `btoa` throws on anything outside
 * latin1, so that shortcut cannot even express a non-ASCII handle, and a
 * test written with it proves nothing about how such a payload decodes.
 */
function seg(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bearer(claims: Record<string, unknown>): string {
  return `${seg({ alg: "HS256", typ: "JWT" })}.${seg(claims)}.sig`;
}

const GOOD = { sub: "4242", user_id: 4242, tv: 7 };

describe("reading the claims", () => {
  it("accepts the shape the server actually mints", () => {
    // JwtToken::encode emits iss/sub/iat/exp/ver/jti/tv/user_id/handle.
    const token = bearer({
      iss: "https://example.test/",
      sub: "4242",
      iat: 1,
      exp: 2,
      ver: 1,
      jti: "uuid",
      tv: 7,
      user_id: 4242,
      handle: "viewer-a",
    });
    expect(readBearerConsistencyClaims(token)).toEqual({
      subject: "4242",
      userId: 4242,
      tokenVersion: 7,
    });
  });

  it("reads a non-ASCII handle without corrupting the payload", () => {
    // The payload is UTF-8 JSON; treating atob's output as latin1 would
    // throw or mangle it, and a throw here would look like "malformed".
    const token = bearer({ ...GOOD, handle: "viewer-ü-😀" });
    expect(readBearerConsistencyClaims(token)?.tokenVersion).toBe(7);
  });

  it.each([
    ["not a string", 42],
    ["empty", ""],
    ["one segment", "abc"],
    ["two segments", "a.b"],
    ["four segments", "a.b.c.d"],
    ["non-base64url payload", "h.not*base64url.s"],
    ["standard base64 with padding", `h.${btoa('{"a":1}')}.s`],
    ["payload that is not JSON", "h.bm90LWpzb24.s"],
    ["payload that is a JSON array", `h.${seg([1, 2])}.s`],
    ["payload that is JSON null", `h.${seg(null)}.s`],
  ])("refuses %s", (_label, token) => {
    expect(readBearerConsistencyClaims(token)).toBeNull();
  });

  it.each([
    ["sub missing", { user_id: 4242, tv: 7 }],
    ["sub empty", { sub: "", user_id: 4242, tv: 7 }],
    ["sub not a string", { sub: 4242, user_id: 4242, tv: 7 }],
    ["user_id missing", { sub: "4242", tv: 7 }],
    ["user_id zero", { sub: "0", user_id: 0, tv: 7 }],
    ["user_id negative", { sub: "-1", user_id: -1, tv: 7 }],
    ["user_id fractional", { sub: "4242.5", user_id: 4242.5, tv: 7 }],
    ["user_id a string", { sub: "4242", user_id: "4242", tv: 7 }],
    ["sub disagrees with user_id", { sub: "9001", user_id: 4242, tv: 7 }],
  ])("refuses a bad subject: %s", (_label, claims) => {
    expect(readBearerConsistencyClaims(bearer(claims))).toBeNull();
  });

  it.each([
    ["tv missing", { sub: "4242", user_id: 4242 }],
    ["tv null", { ...GOOD, tv: null }],
    ["tv a string", { ...GOOD, tv: "7" }],
    ["tv negative", { ...GOOD, tv: -1 }],
    ["tv fractional", { ...GOOD, tv: 7.5 }],
    ["tv above the bound", { ...GOOD, tv: TOKEN_VERSION_MAX + 1 }],
    ["tv absurd", { ...GOOD, tv: 1e308 }],
  ])("refuses a bad token version: %s", (_label, claims) => {
    expect(readBearerConsistencyClaims(bearer(claims))).toBeNull();
  });

  it("treats an ABSENT tv as malformed, not as zero", () => {
    // The server treats a missing `tv` as 0 for its own comparison, but
    // this module is not the server. Ranking a claimless token against
    // ours would be inventing information.
    expect(readBearerConsistencyClaims(bearer({ sub: "4242", user_id: 4242 }))).toBeNull();
  });

  it("accepts the bounds themselves", () => {
    expect(readBearerConsistencyClaims(bearer({ ...GOOD, tv: 0 }))?.tokenVersion).toBe(0);
    expect(
      readBearerConsistencyClaims(bearer({ ...GOOD, tv: TOKEN_VERSION_MAX }))?.tokenVersion,
    ).toBe(TOKEN_VERSION_MAX);
  });
});

describe("the check itself only ever vetoes", () => {
  const minted = bearer({ ...GOOD, tv: 7, jti: "minted" });

  it("passes a bearer at the same token version", () => {
    const concurrent = bearer({ ...GOOD, tv: 7, jti: "concurrent" });
    expect(bearerFailsConsistencyCheck(concurrent, minted)).toBe(false);
  });

  it("passes a bearer at a HIGHER token version", () => {
    const later = bearer({ ...GOOD, tv: 8, jti: "later" });
    expect(bearerFailsConsistencyCheck(later, minted)).toBe(false);
  });

  it("VETOES a bearer at a lower token version — minted before the bump", () => {
    const stale = bearer({ ...GOOD, tv: 6, jti: "stale" });
    expect(bearerFailsConsistencyCheck(stale, minted)).toBe(true);
  });

  it("VETOES a bearer naming a different subject, even at a higher version", () => {
    const other = bearer({ sub: "9001", user_id: 9001, tv: 99 });
    expect(bearerFailsConsistencyCheck(other, minted)).toBe(true);
  });

  it("VETOES when EITHER side is unreadable", () => {
    const good = bearer({ ...GOOD, tv: 7, jti: "x" });
    expect(bearerFailsConsistencyCheck("rubbish", minted)).toBe(true);
    expect(bearerFailsConsistencyCheck(good, "rubbish")).toBe(true);
    expect(bearerFailsConsistencyCheck(null, minted)).toBe(true);
    expect(bearerFailsConsistencyCheck(good, undefined)).toBe(true);
    expect(bearerFailsConsistencyCheck(undefined, undefined)).toBe(true);
  });

  it("VETOES a payload whose tv was tampered to something enormous", () => {
    // The bound is what stops a hostile payload ranking itself above ours.
    const inflated = bearer({ ...GOOD, tv: Number.MAX_SAFE_INTEGER });
    expect(bearerFailsConsistencyCheck(inflated, minted)).toBe(true);
  });
});
