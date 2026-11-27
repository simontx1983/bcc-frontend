/**
 * The validator team wrappers hit the agreed member-side paths with the
 * agreed methods, and send each body unchanged: a representative removal
 * carries no password, the visibility change is a PATCH, the permissions
 * save is a PUT.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const bccFetchAsClient = vi.fn();
vi.mock("@/lib/api/client", () => ({
  bccFetchAsClient: (...a: unknown[]) => bccFetchAsClient(...a),
}));

const {
  acceptTeamInvite,
  declineTeamInvite,
  getMyTeamInvites,
  getValidatorTeam,
  getValidatorTeamPermissions,
  inviteValidatorTeamMember,
  leaveValidatorTeam,
  reconfirmValidatorTeamMember,
  removeValidatorTeamMember,
  revertValidatorTeamEvent,
  setValidatorTeamVisibility,
  updateValidatorTeamPermissions,
} = await import("@/lib/api/validator-team-endpoints");

beforeEach(() => {
  bccFetchAsClient.mockReset();
  bccFetchAsClient.mockResolvedValue({});
});

const call = () => bccFetchAsClient.mock.calls[0] as [string, { method: string; body?: unknown; signal?: AbortSignal }];

describe("validator team endpoints", () => {
  it("GETs the team and the permissions with the signal", async () => {
    const signal = new AbortController().signal;
    await getValidatorTeam(40, signal);
    expect(call()).toEqual(["me/validator-pages/40/team", { method: "GET", signal }]);

    bccFetchAsClient.mockClear();
    await getValidatorTeamPermissions(40, signal);
    expect(call()).toEqual(["me/validator-pages/40/team/permissions", { method: "GET", signal }]);
  });

  it("POSTs an invite with the body as given", async () => {
    const body = { user_id: 12, role: "representative" as const };
    await inviteValidatorTeamMember(40, body);
    expect(call()).toEqual(["me/validator-pages/40/team/invites", { method: "POST", body }]);
  });

  it("POSTs remove with the password only when the caller sends one", async () => {
    await removeValidatorTeamMember(40, 101, { current_password: "pw" });
    expect(call()).toEqual(["me/validator-pages/40/team/101/remove", { method: "POST", body: { current_password: "pw" } }]);

    bccFetchAsClient.mockClear();
    await removeValidatorTeamMember(40, 102, {});
    expect(call()).toEqual(["me/validator-pages/40/team/102/remove", { method: "POST", body: {} }]);
  });

  it("POSTs reconfirm, leave and revert to their routes", async () => {
    await reconfirmValidatorTeamMember(40, 105, { current_password: "pw" });
    expect(call()).toEqual(["me/validator-pages/40/team/105/reconfirm", { method: "POST", body: { current_password: "pw" } }]);

    bccFetchAsClient.mockClear();
    await leaveValidatorTeam(40);
    expect(call()).toEqual(["me/validator-pages/40/team/leave", { method: "POST" }]);

    bccFetchAsClient.mockClear();
    await revertValidatorTeamEvent(40, 91);
    expect(call()).toEqual(["me/validator-pages/40/team/revert/91", { method: "POST" }]);
  });

  it("PATCHes visibility and PUTs the permissions", async () => {
    await setValidatorTeamVisibility(40, { show_publicly: true });
    expect(call()).toEqual(["me/validator-pages/40/team/visibility", { method: "PATCH", body: { show_publicly: true } }]);

    bccFetchAsClient.mockClear();
    const body = { roles: { administrator: { reply_reviews: true }, representative: {} }, current_password: "pw" };
    await updateValidatorTeamPermissions(40, body);
    expect(call()).toEqual(["me/validator-pages/40/team/permissions", { method: "PUT", body }]);
  });

  it("reads my invites and answers one", async () => {
    const signal = new AbortController().signal;
    await getMyTeamInvites(signal);
    expect(call()).toEqual(["me/team-invites", { method: "GET", signal }]);

    bccFetchAsClient.mockClear();
    await acceptTeamInvite(301);
    expect(call()).toEqual(["me/team-invites/301/accept", { method: "POST" }]);

    bccFetchAsClient.mockClear();
    await declineTeamInvite(301);
    expect(call()).toEqual(["me/team-invites/301/decline", { method: "POST" }]);
  });
});
