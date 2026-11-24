/**
 * membership-gate — who decides who gets into a group, and where that
 * decision is made. Shared by GroupMembershipAdmin (the "Requests &
 * invitations" block) and GroupMembershipStrip (its "N requests waiting"
 * pointer, F-388).
 *
 * ⚠ Keep this module dependency-free (a type import only). The strip
 * renders on every group page; importing these from GroupMembershipAdmin
 * pulled the whole admin module graph (its hooks, endpoints and client env)
 * into every group page.
 */

import type { GroupDetailResponse } from "@/lib/api/types";

/**
 * The `id` of the Members tab's "Requests & invitations" block, so a link
 * can land on it: `/communities/{slug}/members#requests`. The strip's
 * pointer links here, and bcc-trust #757 (F-389) points the
 * `bcc_group_join_requested` bell row here. Changing it breaks that link.
 */
export const MEMBERSHIP_REQUESTS_ANCHOR = "requests";

/**
 * Whether the viewer decides who gets into this group. The server's
 * `can_manage_membership` (closed and secret groups) when present; on a
 * backend without it, `pending_request_count` is non-null for exactly the
 * same viewers, but only on closed groups.
 */
export function canManageMembership(group: GroupDetailResponse): boolean {
  if (typeof group.can_manage_membership === "boolean") return group.can_manage_membership;
  return group.pending_request_count !== null && group.pending_request_count !== undefined;
}
