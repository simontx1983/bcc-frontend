/**
 * Typed wrappers for /me/holder-groups endpoints (§4.7.1).
 *
 * Backend term: "holder groups" — frontend label: "Communities."
 * The wire stays backend-named so a debug session can match a JSON
 * response field to its TS shape without translation.
 *
 * All five routes are authenticated (`me/...`); 401 → `bcc_unauthorized`.
 * Join/leave can also surface `bcc_permission_denied` whose `message`
 * field is the server-authoritative `unlock_hint` — render verbatim.
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type {
  HolderGroupPreferences,
  HolderGroupPreferencesPatch,
  HolderGroupPreferencesUpdateResponse,
  JoinHolderGroupResponse,
  LeaveHolderGroupResponse,
  MyHolderGroupsResponse,
} from "@/lib/api/types";

/**
 * GET /me/holder-groups — joined + eligible_to_join + opted_out
 * buckets in one round trip. Server already filters and sorts; the
 * frontend renders the buckets as-is (§S no client-side eligibility).
 */
export function getMyHolderGroups(
  signal?: AbortSignal
): Promise<MyHolderGroupsResponse> {
  return bccFetchAsClient<MyHolderGroupsResponse>("me/holder-groups", {
    method: "GET",
    signal,
  });
}

/**
 * POST /me/holder-groups/:id/join — explicit user-initiated join.
 *
 * Server re-checks eligibility at write time (NFT ownership can move
 * between the GET and the POST). Failures come back as typed
 * BccApiError:
 *   - bcc_invalid_request (400) — group is not a holder group
 *   - bcc_permission_denied (403) — opt-out cooldown OR not eligible.
 *     `message` is the user-facing copy ("Hold a Bored Apes NFT to
 *     join…" / "You opted out of this community recently…"). Render
 *     verbatim — never substitute a generic 403 string.
 *   - bcc_internal_error (503) — chain unsupported (transient infra)
 */
export function joinHolderGroup(
  groupId: number
): Promise<JoinHolderGroupResponse> {
  return bccFetchAsClient<JoinHolderGroupResponse>(
    `me/holder-groups/${groupId}/join`,
    { method: "POST" }
  );
}

/**
 * POST /me/holder-groups/:id/leave — leave + record TTL'd opt-out
 * (default 90 days, filterable server-side).
 *
 * Errors:
 *   - bcc_invalid_request (400) — group is not a holder group
 *   - bcc_permission_denied (403) — caller is the group owner
 *     ("Owners cannot leave their own community…"). Render verbatim.
 */
export function leaveHolderGroup(
  groupId: number
): Promise<LeaveHolderGroupResponse> {
  return bccFetchAsClient<LeaveHolderGroupResponse>(
    `me/holder-groups/${groupId}/leave`,
    { method: "POST" }
  );
}

/**
 * GET /me/holder-groups/preferences — read auto_join flag.
 */
export function getHolderGroupPreferences(
  signal?: AbortSignal
): Promise<HolderGroupPreferences> {
  return bccFetchAsClient<HolderGroupPreferences>(
    "me/holder-groups/preferences",
    { method: "GET", signal }
  );
}

/**
 * PATCH /me/holder-groups/preferences — toggle auto_join.
 *
 * When toggling ON, the server runs a synchronous reconcile sweep —
 * the response includes `reconciled.joined` so the toast can surface
 * the immediate join count without a second round trip.
 */
export function updateHolderGroupPreferences(
  patch: HolderGroupPreferencesPatch
): Promise<HolderGroupPreferencesUpdateResponse> {
  return bccFetchAsClient<HolderGroupPreferencesUpdateResponse>(
    "me/holder-groups/preferences",
    { method: "PATCH", body: patch }
  );
}
