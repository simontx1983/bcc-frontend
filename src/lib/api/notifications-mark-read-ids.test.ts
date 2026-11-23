/**
 * F-516: markNotificationsReadByIds posts `{ ids }` to mark-read; the
 * single and mark-all modes keep their own bodies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const bccFetchAsClient = vi.fn();
vi.mock("@/lib/api/client", () => ({
  bccFetchAsClient: (...a: unknown[]) => bccFetchAsClient(...a),
}));

import {
  markNotificationsRead,
  markNotificationsReadByIds,
} from "@/lib/api/notifications-endpoints";

beforeEach(() => {
  bccFetchAsClient.mockReset();
  bccFetchAsClient.mockResolvedValue({ ok: true, updated: 0 });
});

describe("mark-read bodies", () => {
  it("a push's ids go as { ids }", async () => {
    await markNotificationsReadByIds([21, 22]);

    expect(bccFetchAsClient).toHaveBeenCalledWith("me/notifications/mark-read", {
      method: "POST",
      body: { ids: [21, 22] },
    });
  });

  it("one id and mark-all are unchanged", async () => {
    await markNotificationsRead(7);
    await markNotificationsRead();

    expect(bccFetchAsClient.mock.calls).toEqual([
      ["me/notifications/mark-read", { method: "POST", body: { id: 7 } }],
      ["me/notifications/mark-read", { method: "POST", body: {} }],
    ]);
  });
});
