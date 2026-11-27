/**
 * Typed wrappers for the validator team routes on the member side
 * (validator admin V1, PR B2): the team screen and its writes, the owner
 * revert, the permissions page, and the signed-in member's own invites.
 *
 * Every route is session-scoped and policy-gated server-side. These
 * wrappers don't pre-validate: what the viewer may do arrives as route
 * 5's `can`, and the server re-checks every write.
 *
 * The invite picker is the existing mention search
 * (mentions-endpoints.ts); the server re-checks the invitee and refuses
 * with one generic `invite_not_possible`.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  DeclineTeamInviteResponse,
  InviteValidatorTeamMemberRequest,
  LeaveValidatorTeamResponse,
  MyTeamInvitesResponse,
  ReconfirmValidatorTeamMemberRequest,
  RemoveValidatorTeamMemberRequest,
  RemoveValidatorTeamMemberResponse,
  RevertValidatorTeamEventResponse,
  UpdateValidatorTeamPermissionsRequest,
  ValidatorTeamMembershipResponse,
  ValidatorTeamPermissions,
  ValidatorTeamResponse,
  ValidatorTeamVisibility,
} from "@/lib/api/types";

const teamPath = (pageId: number) => `me/validator-pages/${pageId}/team`;

/** Route 5: the viewer's role, what they may do, the members and (owner only) the revertable changes. */
export function getValidatorTeam(pageId: number, signal?: AbortSignal): Promise<ValidatorTeamResponse> {
  return bccFetchAsClient<ValidatorTeamResponse>(teamPath(pageId), { method: "GET", signal });
}

/** Route 6: invite a member. 201 with the pending membership. */
export function inviteValidatorTeamMember(
  pageId: number,
  body: InviteValidatorTeamMemberRequest,
): Promise<ValidatorTeamMembershipResponse> {
  return bccFetchAsClient<ValidatorTeamMembershipResponse>(`${teamPath(pageId)}/invites`, {
    method: "POST",
    body,
  });
}

/** Route 7: remove a member or cancel a pending invite. */
export function removeValidatorTeamMember(
  pageId: number,
  membershipId: number,
  body: RemoveValidatorTeamMemberRequest,
): Promise<RemoveValidatorTeamMemberResponse> {
  return bccFetchAsClient<RemoveValidatorTeamMemberResponse>(
    `${teamPath(pageId)}/${membershipId}/remove`,
    { method: "POST", body },
  );
}

/** Re-confirm a member added without a password, with the caller's own password. */
export function reconfirmValidatorTeamMember(
  pageId: number,
  membershipId: number,
  body: ReconfirmValidatorTeamMemberRequest,
): Promise<ValidatorTeamMembershipResponse> {
  return bccFetchAsClient<ValidatorTeamMembershipResponse>(
    `${teamPath(pageId)}/${membershipId}/reconfirm`,
    { method: "POST", body },
  );
}

/** Route 10: the viewer leaves the team. */
export function leaveValidatorTeam(pageId: number): Promise<LeaveValidatorTeamResponse> {
  return bccFetchAsClient<LeaveValidatorTeamResponse>(`${teamPath(pageId)}/leave`, {
    method: "POST",
  });
}

/** Route 11: whether the viewer shows on the public team list. Returns the saved value. */
export function setValidatorTeamVisibility(
  pageId: number,
  body: ValidatorTeamVisibility,
): Promise<ValidatorTeamVisibility> {
  return bccFetchAsClient<ValidatorTeamVisibility>(`${teamPath(pageId)}/visibility`, {
    method: "PATCH",
    body,
  });
}

/** Owner only: undo one change in a step. */
export function revertValidatorTeamEvent(
  pageId: number,
  eventId: number,
): Promise<RevertValidatorTeamEventResponse> {
  return bccFetchAsClient<RevertValidatorTeamEventResponse>(
    `${teamPath(pageId)}/revert/${eventId}`,
    { method: "POST" },
  );
}

/** Owner only. A settings read that fails is a 503, never the defaults. */
export function getValidatorTeamPermissions(
  pageId: number,
  signal?: AbortSignal,
): Promise<ValidatorTeamPermissions> {
  return bccFetchAsClient<ValidatorTeamPermissions>(`${teamPath(pageId)}/permissions`, {
    method: "GET",
    signal,
  });
}

/** Owner only: save the whole grid with the owner's password. Returns the saved settings. */
export function updateValidatorTeamPermissions(
  pageId: number,
  body: UpdateValidatorTeamPermissionsRequest,
): Promise<ValidatorTeamPermissions> {
  return bccFetchAsClient<ValidatorTeamPermissions>(`${teamPath(pageId)}/permissions`, {
    method: "PUT",
    body,
  });
}

/** Route 8: the signed-in member's pending invites. */
export function getMyTeamInvites(signal?: AbortSignal): Promise<MyTeamInvitesResponse> {
  return bccFetchAsClient<MyTeamInvitesResponse>("me/team-invites", { method: "GET", signal });
}

/** Route 9: accept an invite. */
export function acceptTeamInvite(membershipId: number): Promise<ValidatorTeamMembershipResponse> {
  return bccFetchAsClient<ValidatorTeamMembershipResponse>(
    `me/team-invites/${membershipId}/accept`,
    { method: "POST" },
  );
}

/** Route 9: decline an invite. */
export function declineTeamInvite(membershipId: number): Promise<DeclineTeamInviteResponse> {
  return bccFetchAsClient<DeclineTeamInviteResponse>(`me/team-invites/${membershipId}/decline`, {
    method: "POST",
  });
}
