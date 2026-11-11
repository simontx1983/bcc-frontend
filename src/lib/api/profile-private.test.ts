/**
 * F-02 (contract v1.91) — the one predicate every surface branches on.
 *
 * `profile_private` is `bcc_forbidden` 403 PLUS `error.data.reason`. The same
 * routes also answer `bcc_permission_denied` 403 about the viewer's own
 * standing, so status alone, or code alone, must not match.
 */

import { describe, expect, it } from "vitest";

import { isProfilePrivate, retryUnlessProfilePrivate } from "@/lib/api/errors";
import { BccApiError, type ApiErrorBody } from "@/lib/api/types";

function apiError(code: string, status: number, data?: Record<string, unknown>): BccApiError {
  const body: ApiErrorBody = {
    error: { code, message: "server text", status, ...(data !== undefined ? { data } : {}) },
    _meta: {} as ApiErrorBody["_meta"],
  };
  return new BccApiError(code, "server text", status, body);
}

const PRIVATE = apiError("bcc_forbidden", 403, { reason: "profile_private" });

describe("isProfilePrivate", () => {
  it("is true for bcc_forbidden carrying reason profile_private", () => {
    expect(PRIVATE.data).toEqual({ reason: "profile_private" });
    expect(isProfilePrivate(PRIVATE)).toBe(true);
  });

  it("is false for bcc_forbidden with another reason", () => {
    expect(isProfilePrivate(apiError("bcc_forbidden", 403, { reason: "not_owner" }))).toBe(false);
  });

  it("is false for bcc_forbidden with no data at all", () => {
    expect(isProfilePrivate(apiError("bcc_forbidden", 403))).toBe(false);
  });

  it("is false for bcc_permission_denied, even with the same reason", () => {
    expect(isProfilePrivate(apiError("bcc_permission_denied", 403))).toBe(false);
    expect(
      isProfilePrivate(apiError("bcc_permission_denied", 403, { reason: "profile_private" })),
    ).toBe(false);
  });

  it("is false for a 404", () => {
    expect(isProfilePrivate(apiError("bcc_not_found", 404))).toBe(false);
  });

  it("is false for anything that is not a BccApiError", () => {
    expect(isProfilePrivate(new Error("profile_private"))).toBe(false);
    expect(isProfilePrivate(null)).toBe(false);
    expect(isProfilePrivate({ code: "bcc_forbidden", data: { reason: "profile_private" } })).toBe(
      false,
    );
  });
});

describe("retryUnlessProfilePrivate", () => {
  it("never retries a private profile", () => {
    expect(retryUnlessProfilePrivate(0, PRIVATE)).toBe(false);
  });

  it("keeps the app-wide single retry for everything else", () => {
    const transient = apiError("bcc_unavailable", 503);
    expect(retryUnlessProfilePrivate(0, transient)).toBe(true);
    expect(retryUnlessProfilePrivate(1, transient)).toBe(false);
    expect(retryUnlessProfilePrivate(0, apiError("bcc_permission_denied", 403))).toBe(true);
  });
});
