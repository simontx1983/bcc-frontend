/**
 * The community's minimum must reach the user at the point of refusal, and
 * it must come from `error.data.min_stake_display` — never from
 * `error.message`, which §γ forbids us rendering.
 *
 * Contract v1.85 added the field for exactly this reason: before it, the
 * figure travelled only in the sentence, so the card surfaces could say
 * only "you don't delegate enough" with no amount — the one thing the
 * viewer needs in order to act.
 */

import { describe, expect, it, vi } from "vitest";

// Same shim the sibling tests use: importing the hook module pulls in the
// API client, which asserts its env at module load.
vi.mock("@/lib/api/client", () => ({ bccFetchAsClient: vi.fn(), bccFetch: vi.fn() }));

import { humanizeValidatorJoinError, joinMinimum } from "@/hooks/useValidatorGroups";
import { BccApiError, type ApiErrorBody } from "@/lib/api/types";

function refusal(data: Record<string, unknown> | null, message = "server wording"): BccApiError {
  const body = {
    error: { code: "bcc_permission_denied", message, status: 403, data },
  } as unknown as ApiErrorBody;
  return new BccApiError("bcc_permission_denied", message, 403, body);
}

describe("joinMinimum", () => {
  it("reads the amount off the not_eligible refusal", () => {
    expect(joinMinimum(refusal({ reason_code: "not_eligible", min_stake_display: "5 ATOM" }))).toBe(
      "5 ATOM",
    );
  });

  it("is null when the server could not name one", () => {
    expect(joinMinimum(refusal({ reason_code: "not_eligible", min_stake_display: null }))).toBeNull();
    expect(joinMinimum(refusal({ reason_code: "not_eligible" }))).toBeNull();
    expect(joinMinimum(refusal({ reason_code: "not_eligible", min_stake_display: "" }))).toBeNull();
  });

  it("is null on the cooldown refusal, which shares code and status", () => {
    expect(joinMinimum(refusal({ reason_code: "opt_out_active", min_stake_display: "5 ATOM" }))).toBeNull();
  });

  it("is null for an unrelated error", () => {
    expect(joinMinimum(new BccApiError("bcc_rate_limited", "x", 429, null))).toBeNull();
  });
});

describe("humanizeValidatorJoinError", () => {
  it("names the minimum when the refusal carries one", () => {
    const copy = humanizeValidatorJoinError(
      refusal({ reason_code: "not_eligible", min_stake_display: "5 ATOM" }),
    );
    expect(copy).toContain("5 ATOM");
    expect(copy).toContain("linked wallet");
  });

  it("⚠ takes the figure from data, NEVER from error.message", () => {
    // The message names a DIFFERENT number. If we ever rendered it, this
    // would leak 99 — the whole point of the field.
    const copy = humanizeValidatorJoinError(
      refusal(
        { reason_code: "not_eligible", min_stake_display: "5 ATOM" },
        "Delegate at least 99 ATOM to Acme to join this community.",
      ),
    );
    expect(copy).toContain("5 ATOM");
    expect(copy).not.toContain("99");
    expect(copy).not.toContain("Acme");
  });

  it("keeps the generic copy when no minimum is available", () => {
    const copy = humanizeValidatorJoinError(refusal({ reason_code: "not_eligible" }));
    expect(copy).toBe("You don't delegate enough to this validator from a linked wallet.");
  });

  it("still reads differently for the cooldown", () => {
    const copy = humanizeValidatorJoinError(refusal({ reason_code: "opt_out_active" }));
    expect(copy).toContain("rejoin");
    expect(copy).not.toContain("delegate enough");
  });
});
