/**
 * Typed wrappers for /me/groups endpoints (§4.7.3 Plain Group Membership).
 *
 * Plain (non-gated, non-Hall) PeepSo group join/leave. Holder groups
 * use `me/holder-groups`; Halls use `me/halls`. This module is the
 * residual case for `type === "user"` / `type === "system"` groups.
 *
 * Closed and secret groups (F-272, v1.132): a member ASKS to join a
 * closed group (request-join / cancel), and accepts or declines an
 * invitation (invite/accept / decline; GET /me/group-invites lists them —
 * the only way an invitee finds a secret group). Owners, managers and
 * site admins decide requests and send invitations (the owner panels).
 *
 * F-272 errors, shared by every route (contract §4.7.3): 409 `bcc_conflict`
 * — the row is not (or no longer) in the needed state, or "Please retry."
 * when another membership change is in flight; 403 `bcc_permission_denied`
 * — refused (always the generic copy: a ban and a block answer the same);
 * 503 `bcc_unavailable` — nothing was written, retryable.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  CreatePlainGroupRequest,
  CreatePlainGroupResponse,
  GroupJoinRequestItem,
  GroupMembershipChangeResponse,
  GroupMembershipDecisionResponse,
  GroupOutstandingInviteItem,
  GroupPendingListResponse,
  MyGroupInvitesResponse,
  JoinPlainGroupResponse,
  LeavePlainGroupResponse,
  SetGroupPostPolicyResponse,
  TransferCommunityRequest,
  TransferCommunityResponse,
} from "@/lib/api/types";

/**
 * POST /me/groups/:id/join — join an open user/system group.
 *
 * Errors:
 *   - bcc_unauthorized (401) — anonymous caller
 *   - bcc_invalid_request (404) — group not found
 *   - bcc_invalid_request (400) — group is a holder group or Hall
 *     (use the dedicated endpoint instead)
 *   - bcc_permission_denied (403) — closed/secret group; `message`
 *     is the user-facing copy ("requires admin approval…" /
 *     "invite-only"). Render verbatim.
 */
export function joinPlainGroup(
  groupId: number
): Promise<JoinPlainGroupResponse> {
  return bccFetchAsClient<JoinPlainGroupResponse>(
    `me/groups/${groupId}/join`,
    { method: "POST" }
  );
}

/**
 * POST /me/groups/:id/leave — leave a plain group I'm a member of.
 *
 * Errors:
 *   - bcc_unauthorized (401)
 *   - bcc_invalid_request (404) — group not found
 *   - bcc_invalid_request (400) — group is a holder group or Hall
 *   - bcc_permission_denied (403) — caller is the group owner
 *     ("Owners cannot leave their own community…"). Render verbatim.
 */
export function leavePlainGroup(
  groupId: number
): Promise<LeavePlainGroupResponse> {
  return bccFetchAsClient<LeavePlainGroupResponse>(
    `me/groups/${groupId}/leave`,
    { method: "POST" }
  );
}

/**
 * POST /me/groups — create a new plain (non-gated, non-Hall) group
 * owned by the viewer. V1: name + description + privacy (open|closed).
 *
 * Errors:
 *   - bcc_unauthorized (401) — anonymous caller
 *   - bcc_invalid_request (400) — name too short / too long / description
 *     exceeds 2000 chars. Render `message` verbatim per §A2.
 *   - bcc_conflict (409) — lock contention with a concurrent custody
 *     change (custody hardening). Transient; safe to retry.
 *   - bcc_rate_limited (429) — 5/hour per user
 *   - bcc_internal_error (500) — PeepSo unavailable / wp_insert_post
 *     failed; safe to retry after a moment
 */
export function createPlainGroup(
  input: CreatePlainGroupRequest
): Promise<CreatePlainGroupResponse> {
  return bccFetchAsClient<CreatePlainGroupResponse>("me/groups", {
    method: "POST",
    body: input,
  });
}

/**
 * POST /me/groups/:id/transfer — Rank Phase 7 (§21.2, v1.62): hand a
 * User-kind (member-created) community to another ACTIVE member. Both
 * parties' 30-day custody cooldowns re-arm on success.
 *
 * Errors:
 *   - bcc_unauthorized (401)
 *   - bcc_not_found (404) — group missing, viewer not an active member,
 *     or secret group (existence never leaked)
 *   - bcc_forbidden (403) — viewer isn't the owner (no `data.reason`),
 *     giver gate (`data.reason` ∈ TransferGiverDenyReason), or receiver
 *     gate (`data.reason` === "receiver_ineligible" — custody hardening
 *     collapsed the six receiver reasons into one opaque reason so the
 *     server never discloses WHY the target is ineligible)
 *   - bcc_invalid_request (400) — non-User-kind group, self-transfer,
 *     or receiver not already a member
 *   - bcc_conflict (409) — lock contention with a concurrent custody
 *     change (custody hardening). Transient; safe to retry.
 *   - bcc_rate_limited (429) — 5/hour
 *   - bcc_internal_error (500) — write failed; safe to retry
 *
 * NOT registered on pre-Phase-7 backends — a 404 there degrades to the
 * generic error copy at the call site.
 */
export function transferGroupOwnership(
  groupId: number,
  toUserId: number
): Promise<TransferCommunityResponse> {
  const body: TransferCommunityRequest = { to_user_id: toUserId };
  return bccFetchAsClient<TransferCommunityResponse>(
    `me/groups/${groupId}/transfer`,
    { method: "POST", body }
  );
}

/**
 * POST /me/groups/:id/post-policy — CL-FN06 owner control: may
 * ordinary members of this group set `visibility=public_all`
 * (syndicate to the global feed)? Owner / manager / site-admin only
 * (moderators may USE public_all but not manage the policy).
 *
 * Errors:
 *   - bcc_unauthorized (401)
 *   - bcc_not_found (404) — group not found OR secret group the
 *     caller isn't a member of (existence never leaked)
 *   - bcc_permission_denied (403) — not owner/manager/site-admin
 *   - bcc_rate_limited (429) — 20/60s per user
 */
export function setGroupPostPolicy(
  groupId: number,
  publicAllMembers: boolean
): Promise<SetGroupPostPolicyResponse> {
  return bccFetchAsClient<SetGroupPostPolicyResponse>(
    `me/groups/${groupId}/post-policy`,
    { method: "POST", body: { public_all_members: publicAllMembers } }
  );
}

/**
 * POST /me/groups/:id/request-join — ask to join a CLOSED group (F-272).
 * 200 `{ status: "requested", group_id }`. 403 within 7 days of a denied
 * request ("You can't ask to join this community again yet."), or the
 * generic refusal; 400 not a closed group; 409; 503.
 */
export function requestJoinGroup(groupId: number): Promise<GroupMembershipChangeResponse> {
  return bccFetchAsClient<GroupMembershipChangeResponse>(`me/groups/${groupId}/request-join`, {
    method: "POST",
  });
}

/** POST /me/groups/:id/request-join/cancel — withdraw one's own pending request. 409 when none. */
export function cancelJoinRequest(groupId: number): Promise<GroupMembershipChangeResponse> {
  return bccFetchAsClient<GroupMembershipChangeResponse>(`me/groups/${groupId}/request-join/cancel`, {
    method: "POST",
  });
}

/** GET /me/group-invites — the caller's open invitations, newest first. 503 when unreadable. */
export function getMyGroupInvites(
  params: { offset?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<MyGroupInvitesResponse> {
  const search = new URLSearchParams();
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  const q = search.toString();
  return bccFetchAsClient<MyGroupInvitesResponse>(`me/group-invites${q !== "" ? `?${q}` : ""}`, {
    method: "GET",
    ...(signal !== undefined ? { signal } : {}),
  });
}

/** POST /me/groups/:id/invite/accept — become a member. 404 no pending invitation; 409; 503. */
export function acceptGroupInvite(groupId: number): Promise<GroupMembershipChangeResponse> {
  return bccFetchAsClient<GroupMembershipChangeResponse>(`me/groups/${groupId}/invite/accept`, {
    method: "POST",
  });
}

/** POST /me/groups/:id/invite/decline — nobody is notified. Same 404 / 409 as accept. */
export function declineGroupInvite(groupId: number): Promise<GroupMembershipChangeResponse> {
  return bccFetchAsClient<GroupMembershipChangeResponse>(`me/groups/${groupId}/invite/decline`, {
    method: "POST",
  });
}

// ── F-272 (b): the owner / manager / site-admin side ─────────────────
// Every route answers 403 to anyone else and 400 on a holder group, a Hall
// or a delegator community; the UI only mounts for viewers the group
// detail marks as deciders.

function pendingQuery(params: { offset?: number; limit?: number }): string {
  const search = new URLSearchParams();
  if (params.offset !== undefined) search.set("offset", String(params.offset));
  if (params.limit !== undefined) search.set("limit", String(params.limit));
  const q = search.toString();
  return q !== "" ? `?${q}` : "";
}

/** GET /me/groups/:id/requests — pending requests, newest first. 503 when unreadable (never an empty list). */
export function getGroupJoinRequests(
  groupId: number,
  params: { offset?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<GroupPendingListResponse<GroupJoinRequestItem>> {
  return bccFetchAsClient<GroupPendingListResponse<GroupJoinRequestItem>>(
    `me/groups/${groupId}/requests${pendingQuery(params)}`,
    { method: "GET", ...(signal !== undefined ? { signal } : {}) },
  );
}

/** POST /me/groups/:id/requests/:user_id/approve — the requester becomes a member. 403 (incl. suspended); 409. */
export function approveJoinRequest(groupId: number, userId: number): Promise<GroupMembershipDecisionResponse> {
  return bccFetchAsClient<GroupMembershipDecisionResponse>(
    `me/groups/${groupId}/requests/${userId}/approve`,
    { method: "POST" },
  );
}

/** POST /me/groups/:id/requests/:user_id/deny — silent; the requester may not ask again for 7 days. 409. */
export function denyJoinRequest(groupId: number, userId: number): Promise<GroupMembershipDecisionResponse> {
  return bccFetchAsClient<GroupMembershipDecisionResponse>(
    `me/groups/${groupId}/requests/${userId}/deny`,
    { method: "POST" },
  );
}

/** GET /me/groups/:id/invites — outstanding invitations, newest first. 503 when unreadable. */
export function getGroupInvites(
  groupId: number,
  params: { offset?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<GroupPendingListResponse<GroupOutstandingInviteItem>> {
  return bccFetchAsClient<GroupPendingListResponse<GroupOutstandingInviteItem>>(
    `me/groups/${groupId}/invites${pendingQuery(params)}`,
    { method: "GET", ...(signal !== undefined ? { signal } : {}) },
  );
}

/**
 * POST /me/groups/:id/invites — invite a member to a closed or secret group.
 * 400 open group / self; 404 "Member not found." (unknown OR suspended,
 * identical); 403 the generic "This member can't be invited."; 409 already
 * a member / invited / has asked (approve instead); 429 the 200-open or
 * 50-a-day cap.
 */
export function inviteToGroup(groupId: number, userId: number): Promise<GroupMembershipDecisionResponse> {
  return bccFetchAsClient<GroupMembershipDecisionResponse>(`me/groups/${groupId}/invites`, {
    method: "POST",
    body: { user_id: userId },
  });
}

/** POST /me/groups/:id/invites/:user_id/revoke — withdraw an outstanding invitation. 409. */
export function revokeGroupInvite(groupId: number, userId: number): Promise<GroupMembershipDecisionResponse> {
  return bccFetchAsClient<GroupMembershipDecisionResponse>(
    `me/groups/${groupId}/invites/${userId}/revoke`,
    { method: "POST" },
  );
}
