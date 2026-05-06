/**
 * Typed wrappers for /me/groups endpoints (§4.7.3 Plain Group Membership).
 *
 * Plain (non-gated, non-Local) PeepSo group join/leave. Holder groups
 * use `me/holder-groups`; Locals use `me/locals`. This module is the
 * residual case for `type === "user"` / `type === "system"` groups.
 *
 * The server rejects closed/secret writes with `bcc_permission_denied`
 * + a hint pointing at PeepSo's group page (where the request-to-join
 * flow lives) — we don't replicate PeepSo's invitation machinery here.
 * Render the typed `BccApiError.message` verbatim per §A2.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  JoinPlainGroupResponse,
  LeavePlainGroupResponse,
} from "@/lib/api/types";

/**
 * POST /me/groups/:id/join — join an open user/system group.
 *
 * Errors:
 *   - bcc_unauthorized (401) — anonymous caller
 *   - bcc_invalid_request (404) — group not found
 *   - bcc_invalid_request (400) — group is a holder group or Local
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
 *   - bcc_invalid_request (400) — group is a holder group or Local
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
