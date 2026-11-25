/**
 * ClaimPageResponse matches what POST /pages/:id/claim sends (contract §4).
 * Compile-time pins, enforced by `tsc --noEmit` (CI and the edit hook): the
 * server's example satisfies the type, and the three things the type used to
 * claim are rejected. ClaimFlow reads none of these fields today; the pins
 * keep a future reader honest.
 */

import { describe, expect, it } from "vitest";

import type { ClaimPageResponse } from "@/lib/api/types";

const SERVER_EXAMPLE = {
  claim_id: 311,
  page_id: 1842,
  entity_type: "validator",
  entity_id: 47,
  role: "operator",
  is_primary: true,
  status: "verified",
  message: "Verified as operator.",
  claimed_by: { user_id: 42, handle: "alice" },
} satisfies ClaimPageResponse;

describe("ClaimPageResponse", () => {
  it("the contract's example satisfies it", () => {
    expect(SERVER_EXAMPLE.claimed_by.handle).toBe("alice");
  });

  it("rejects an `ok` field, a holder role, and a missing claimed_by", () => {
    // @ts-expect-error — the server sends no `ok` field
    const withOk: ClaimPageResponse = { ...SERVER_EXAMPLE, ok: true };
    // @ts-expect-error — a holder is refused (403 holder_not_owner), never a success role
    const holder: ClaimPageResponse = { ...SERVER_EXAMPLE, role: "holder" };
    // @ts-expect-error — claimed_by is always sent
    const noClaimer: ClaimPageResponse = {
      claim_id: 311,
      page_id: 1842,
      entity_type: "validator",
      entity_id: 47,
      role: "operator",
      is_primary: true,
      status: "verified",
      message: "Verified as operator.",
    };
    expect([withOk, holder, noClaimer]).toHaveLength(3);
  });
});
