/**
 * Typed wrappers for delegator communities: the verified join and leave
 * under /me/validator-groups (§4.7.6) and the operator's explicit create
 * and minimum edit under /pages/:id/delegator-group.
 *
 * Backend term: "validator groups" — frontend label: "delegator groups."
 * Same idiom as `holder-groups-endpoints.ts`: thin glue over the shared
 * client, no eligibility decisions. Failures come back as typed
 * BccApiError, and copy is keyed on `err.code` at the call site.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  CreateDelegatorGroupRequest,
  DelegatorGroupResponse,
  JoinValidatorGroupResponse,
  LeaveValidatorGroupResponse,
  UpdateDelegatorGroupRequest,
} from "@/lib/api/types";

/**
 * POST /me/validator-groups/:id/join — the server verifies the delegation
 * live, then joins. Failures:
 *   - bcc_permission_denied (403) — not enough delegation, OR a recent
 *     leave is still cooling off. The wire uses one code for both.
 *   - bcc_upstream_unavailable (503) — the delegation couldn't be read.
 *     Fail-closed: the viewer did NOT join, and a retry can succeed.
 *   - bcc_forbidden (403) — suspended account
 *   - bcc_invalid_request (400) — not a delegator community
 *   - bcc_internal_error (503) — chain unsupported
 */
export function joinValidatorGroup(
  groupId: number
): Promise<JoinValidatorGroupResponse> {
  return bccFetchAsClient<JoinValidatorGroupResponse>(
    `me/validator-groups/${groupId}/join`,
    { method: "POST" }
  );
}

/**
 * POST /me/validator-groups/:id/leave — leave + record the TTL'd opt-out.
 * bcc_permission_denied (403) means the caller owns the group.
 */
export function leaveValidatorGroup(
  groupId: number
): Promise<LeaveValidatorGroupResponse> {
  return bccFetchAsClient<LeaveValidatorGroupResponse>(
    `me/validator-groups/${groupId}/leave`,
    { method: "POST" }
  );
}

/**
 * POST /pages/:id/delegator-group — create the page's one group. Failures:
 *   - bcc_forbidden (403) — not the page's current operator
 *   - bcc_not_found (404) — validator isn't bound to this page
 *   - bcc_invalid_request (422) — `min_stake` isn't a plain positive decimal
 *   - bcc_delegator_group_unavailable (400) — unsupported chain
 *   - bcc_conflict (409) — the page has one; `error.data.group` describes it
 */
export function createDelegatorGroup(
  pageId: number,
  request: CreateDelegatorGroupRequest
): Promise<DelegatorGroupResponse> {
  return bccFetchAsClient<DelegatorGroupResponse>(
    `pages/${pageId}/delegator-group`,
    { method: "POST", body: request }
  );
}

/**
 * PATCH /pages/:id/delegator-group — change the minimum. An identical value
 * is a 200 no-op. Failures:
 *   - bcc_forbidden (403) — not the page's current operator
 *   - bcc_not_found (404) — the page has no group
 *   - bcc_invalid_request (422) — `min_stake` isn't a plain positive decimal
 */
export function updateDelegatorGroup(
  pageId: number,
  request: UpdateDelegatorGroupRequest
): Promise<DelegatorGroupResponse> {
  return bccFetchAsClient<DelegatorGroupResponse>(
    `pages/${pageId}/delegator-group`,
    { method: "PATCH", body: request }
  );
}
