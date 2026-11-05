/**
 * Leaving a delegator group refuses only its owner with
 * `bcc_permission_denied`, so that refusal must not read as unmet
 * requirements.
 */

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api/client", () => ({ bccFetchAsClient: vi.fn(), bccFetch: vi.fn() }));

import { validatorLeaveError } from "@/components/profile/panels/GroupsPanel";
import { BccApiError } from "@/lib/api/types";

describe("validatorLeaveError", () => {
  it("tells the owner they can't leave the group they created", () => {
    const message = validatorLeaveError(
      new BccApiError("bcc_permission_denied", "server wording", 403, null),
    );
    expect(message).toBe("You created this group, so you can't leave it.");
    expect(message).not.toMatch(/requirements/);
  });

  it("keeps the shared copy for other failures", () => {
    expect(validatorLeaveError(new BccApiError("bcc_rate_limited", "x", 429, null))).toMatch(/too many attempts/);
  });

  it("returns nothing when there is no error", () => {
    expect(validatorLeaveError(null)).toBeNull();
  });
});
