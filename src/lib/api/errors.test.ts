import { describe, expect, it } from "vitest";

import { humanizeCode, isCode } from "@/lib/api/errors";
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

  it("NEVER leaks err.message — even for an unmapped code with a distinctive message", () => {
    const leaky = err("bcc_internal", "SQLSTATE[42000]: near 'FROM wp_bcc_users'");
    const out = humanizeCode(leaky, { bcc_rate_limited: "Slow down." }, "Something went wrong.");

    expect(out).toBe("Something went wrong.");
    expect(out).not.toBe(leaky.message);
    expect(out).not.toContain("SQLSTATE");
  });
});
