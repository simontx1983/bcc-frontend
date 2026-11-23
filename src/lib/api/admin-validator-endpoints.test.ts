/**
 * The validator admin read wrappers build the agreed V1 paths, send only
 * the filters that are set, and never send an empty value.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const bccFetchAsClient = vi.fn();
vi.mock("@/lib/api/client", () => ({
  bccFetchAsClient: (...a: unknown[]) => bccFetchAsClient(...a),
}));

const {
  getAdminValidatorDirectory,
  getValidatorRelationshipHealth,
  getValidatorRelationshipHistory,
} = await import("@/lib/api/admin-validator-endpoints");

beforeEach(() => {
  bccFetchAsClient.mockReset();
  bccFetchAsClient.mockResolvedValue({});
});

const pathOf = () => bccFetchAsClient.mock.calls[0]?.[0] as string;
const optionsOf = () => bccFetchAsClient.mock.calls[0]?.[1] as { method: string };

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
