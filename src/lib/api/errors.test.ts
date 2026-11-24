import { describe, expect, it } from "vitest";

import { humanizeCode, isCode, isServiceUnavailable } from "@/lib/api/errors";
import { BccApiError } from "@/lib/api/types";

/**
 * Phase γ contract: machine behavior branches on `err.code`, and the
 * server's `error.message` is NEVER user-visible through humanizeCode.
 * A regression here would leak raw server strings (SQL errors, stack
 * fragments) into the UI — the exact thing this module exists to prevent.
 */

const err = (code: string, message = "raw server message") =>
  new BccApiError(code, message, 400, null);

describe("isCode", () => {
  it("narrows on a BccApiError with the matching code", () => {
    expect(isCode(err("bcc_unauthorized"), "bcc_unauthorized")).toBe(true);
  });

  it("is false for a different code", () => {
    expect(isCode(err("bcc_unauthorized"), "bcc_rate_limited")).toBe(false);
  });

  it.each([
    ["plain Error", new Error("bcc_unauthorized")],
    ["null", null],
    ["string that equals the code", "bcc_unauthorized"],
    ["undefined", undefined],
  ])("is false for non-BccApiError (%s)", (_label, value) => {
    expect(isCode(value, "bcc_unauthorized")).toBe(false);
  });
});

describe("humanizeCode", () => {
  it("returns the mapped copy when the code is present", () => {
    expect(
      humanizeCode(err("bcc_rate_limited"), { bcc_rate_limited: "Slow down." }, "Default."),
    ).toBe("Slow down.");
  });

  it("returns defaultCopy when the code is not mapped", () => {
    expect(
      humanizeCode(err("bcc_unmapped"), { bcc_rate_limited: "Slow down." }, "Default."),
    ).toBe("Default.");
  });

  it.each([
    ["plain Error", new Error("network down")],
    ["null", null],
    ["string", "boom"],
  ])("returns defaultCopy for non-BccApiError (%s)", (_label, value) => {
    expect(humanizeCode(value, { bcc_rate_limited: "Slow down." }, "Default.")).toBe("Default.");
  });

  // bcc-trust F-288: a protected route's 401 now says bcc_token_expired /
  // bcc_token_invalid. Copy written for bcc_unauthorized must still apply.
  it.each([["bcc_token_expired"], ["bcc_token_invalid"]])(
    "%s reads as the call site's bcc_unauthorized copy",
    (code) => {
      expect(
        humanizeCode(err(code), { bcc_unauthorized: "Sign in again." }, "Default."),
      ).toBe("Sign in again.");
    },
  );

  it("a call site's own entry for the new code still wins", () => {
    expect(
      humanizeCode(
        err("bcc_token_expired"),
        { bcc_unauthorized: "Sign in again.", bcc_token_expired: "Your session timed out." },
        "Default.",
      ),
    ).toBe("Your session timed out.");
  });

  it("with no bcc_unauthorized entry either, the default applies", () => {
    expect(humanizeCode(err("bcc_token_invalid"), { bcc_rate_limited: "Slow down." }, "Default.")).toBe("Default.");
  });

  it("NEVER leaks err.message — even for an unmapped code with a distinctive message", () => {
    const leaky = err("bcc_internal", "SQLSTATE[42000]: near 'FROM wp_bcc_users'");
    const out = humanizeCode(leaky, { bcc_rate_limited: "Slow down." }, "Something went wrong.");

    expect(out).toBe("Something went wrong.");
    expect(out).not.toBe(leaky.message);
    expect(out).not.toContain("SQLSTATE");
  });
});

/**
 * "The read did not run": the server's own `bcc_unavailable`, or any 503
 * the host answered without a BCC envelope (the client then labels it by
 * body shape, so only the status tells).
 */
describe("isServiceUnavailable", () => {
  const at = (code: string, status: number) => new BccApiError(code, "raw", status, null);

  it.each([
    ["bcc_unavailable at 503", at("bcc_unavailable", 503)],
    ["bcc_invalid_response at 503 (HTML page)", at("bcc_invalid_response", 503)],
    ["bcc_unexpected_status at 503 (JSON, no envelope)", at("bcc_unexpected_status", 503)],
  ])("is true for %s", (_label, value) => {
    expect(isServiceUnavailable(value)).toBe(true);
  });

  it.each([
    ["bcc_invalid_response at 502", at("bcc_invalid_response", 502)],
    ["bcc_internal_error at 500", at("bcc_internal_error", 500)],
    ["bcc_not_found at 404", at("bcc_not_found", 404)],
    ["a network failure", new TypeError("Failed to fetch")],
    ["null", null],
  ])("is false for %s", (_label, value) => {
    expect(isServiceUnavailable(value)).toBe(false);
  });
});
