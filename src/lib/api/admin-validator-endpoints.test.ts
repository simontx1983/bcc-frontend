/**
 * The validator admin wrappers build the agreed V1 paths, send only the
 * filters that are set, never send an empty value, and POST the writes'
 * bodies unchanged.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const bccFetchAsClient = vi.fn();
vi.mock("@/lib/api/client", () => ({
  bccFetchAsClient: (...a: unknown[]) => bccFetchAsClient(...a),
}));

const {
  cancelValidatorOwnerLink,
  getAdminValidatorDirectory,
  getAdminValidatorPageHistory,
  getAdminValidatorPageRelationships,
  getValidatorRelationshipHealth,
  getValidatorRelationshipHistory,
  linkValidatorOwner,
  resendValidatorStepUp,
  revokeValidatorOwner,
  searchAdminUsers,
  startValidatorStepUp,
} = await import("@/lib/api/admin-validator-endpoints");

beforeEach(() => {
  bccFetchAsClient.mockReset();
  bccFetchAsClient.mockResolvedValue({});
});

const pathOf = () => bccFetchAsClient.mock.calls[0]?.[0] as string;
const optionsOf = () => bccFetchAsClient.mock.calls[0]?.[1] as { method: string; body?: unknown };

describe("getAdminValidatorDirectory", () => {
  it("GETs admin/validator-pages with no query string when unfiltered", async () => {
    await getAdminValidatorDirectory();
    expect(pathOf()).toBe("admin/validator-pages");
    expect(optionsOf().method).toBe("GET");
  });

  it("sends chain, state, q, cursor and limit when set", async () => {
    await getAdminValidatorDirectory({
      chain: "cosmoshub",
      state: "staff_verified",
      q: "ada lovelace",
      cursor: "c/2",
      limit: 25,
    });
    expect(pathOf()).toBe(
      "admin/validator-pages?chain=cosmoshub&state=staff_verified&q=ada+lovelace&cursor=c%2F2&limit=25",
    );
  });

  it("drops empty strings rather than sending them", async () => {
    await getAdminValidatorDirectory({ chain: "", q: "", cursor: "" });
    expect(pathOf()).toBe("admin/validator-pages");
  });
});

describe("getValidatorRelationshipHistory", () => {
  it("GETs the global history route", async () => {
    await getValidatorRelationshipHistory();
    expect(pathOf()).toBe("admin/validator-relationships/history");
  });

  it("sends page_id, user_id, cursor and limit when set", async () => {
    await getValidatorRelationshipHistory({ pageId: 12, userId: 7, cursor: "h-2", limit: 25 });
    expect(pathOf()).toBe(
      "admin/validator-relationships/history?page_id=12&user_id=7&cursor=h-2&limit=25",
    );
  });
});

describe("getValidatorRelationshipHealth", () => {
  it("GETs the health route", async () => {
    await getValidatorRelationshipHealth();
    expect(pathOf()).toBe("admin/validator-relationships/health");
    expect(optionsOf().method).toBe("GET");
  });
});

describe("one page (PR B)", () => {
  it("GETs a page's relationships", async () => {
    await getAdminValidatorPageRelationships(40);
    expect(pathOf()).toBe("admin/validator-pages/40/relationships");
    expect(optionsOf().method).toBe("GET");
  });

  it("GETs a page's history, sending cursor and limit only when set", async () => {
    await getAdminValidatorPageHistory(40);
    expect(pathOf()).toBe("admin/validator-pages/40/history");

    bccFetchAsClient.mockClear();
    await getAdminValidatorPageHistory(40, { cursor: "h/2", limit: 25 });
    expect(pathOf()).toBe("admin/validator-pages/40/history?cursor=h%2F2&limit=25");
  });

  it("POSTs admin user search in the body and preserves cancellation", async () => {
    const signal = new AbortController().signal;
    await searchAdminUsers("ada@example.com", signal);
    expect(pathOf()).toBe("admin/users/search");
    expect(pathOf()).not.toContain("?");
    expect(pathOf()).not.toContain("ada");
    expect(optionsOf()).toEqual({ method: "POST", body: { q: "ada@example.com" }, signal });
  });
});

describe("step-up and ownership writes (PR B)", () => {
  it("POSTs the step-up start with the body as given", async () => {
    const body = { action: "link_owner" as const, target_user_id: 12, current_password: "pw" };
    await startValidatorStepUp(40, body);
    expect(pathOf()).toBe("admin/validator-pages/40/step-up");
    expect(optionsOf()).toEqual({ method: "POST", body });
  });

  it("POSTs a resend for the step-up id, escaped", async () => {
    await resendValidatorStepUp("su/1");
    expect(pathOf()).toBe("admin/validator-pages/step-up/su%2F1/resend");
    expect(optionsOf().method).toBe("POST");
  });

  it("POSTs link, revoke and cancel to their routes", async () => {
    const proof = { step_up_id: "su-1", code: "123456" };
    const link = {
      user_id: 12,
      role: "owner" as const,
      verification_method: "website" as const,
      evidence_note: "n",
      evidence_ref: "r",
      ...proof,
    };
    await linkValidatorOwner(40, link);
    expect(pathOf()).toBe("admin/validator-pages/40/relationships");
    expect(optionsOf()).toEqual({ method: "POST", body: link });

    bccFetchAsClient.mockClear();
    await revokeValidatorOwner(40, 77, { reason: "linked_in_error", note: "", ...proof });
    expect(pathOf()).toBe("admin/validator-pages/40/relationships/77/revoke");
    expect(optionsOf().body).toEqual({ reason: "linked_in_error", note: "", ...proof });

    bccFetchAsClient.mockClear();
    await cancelValidatorOwnerLink(40, 77, { note: "", ...proof });
    expect(pathOf()).toBe("admin/validator-pages/40/relationships/77/cancel");
    expect(optionsOf()).toEqual({ method: "POST", body: { note: "", ...proof } });
  });
});
