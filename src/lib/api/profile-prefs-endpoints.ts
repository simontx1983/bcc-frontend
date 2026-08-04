/**
 * §V2 Phase 2.5 — typed wrappers for /me/profile-prefs.
 *
 * Backend: MyProfilePrefsEndpoint @ /wp-json/bcc/v1. Standard BCC
 * envelope. Auth required.
 *
 * Two operations:
 *   - getProfilePrefs   → GET   /me/profile-prefs
 *   - patchProfilePrefs → PATCH /me/profile-prefs (partial update)
 *
 * Storage:
 *   - profile_visibility → peepso_users.usr_profile_acc
 *   - post_visibility    → peepso_profile_post_acc user_meta
 *   - hide_birthday_year → peepso_hide_birthday_year user_meta
 */

import { bccFetchAsClient } from "@/lib/api/client";
import type { MentorEligibilityReason } from "@/lib/api/types";

export type ProfileVisibility = "public" | "members" | "private";
export type PostVisibility = "members" | "private";

export interface ProfilePrefs {
  profile_visibility: ProfileVisibility;
  post_visibility: PostVisibility;
  hide_birthday_year: boolean;
  /** Hide the green "online now" dot on your profile + member widgets. */
  hide_online: boolean;
  /** Exclude your profile from member search and the user directory. */
  hide_from_search: boolean;
  /**
   * Default audience for new wall posts. PeepSo's posting UI reads this
   * as the audience-picker default; PeepSo overwrites it on every post,
   * so consider this a "manual nudge" rather than a permanent override.
   */
  default_post_audience: ProfileVisibility;
  /**
   * §21.4 (v1.62) — explicit mentor-directory opt-in. Read/write.
   * Opting in requires NO eligibility: a non-Veteran may pre-opt-in and
   * lists automatically the day they qualify. OPTIONAL — absent on
   * pre-Phase-7 backends; the mentor settings surface must not mount
   * when this is undefined.
   */
  mentor_opt_in?: boolean;
  /**
   * §21.4 — READ-ONLY: actively listed in /mentors right now
   * (opt-in AND live `list_as_mentor` eligibility).
   */
  mentor_listed?: boolean;
  /**
   * §21.4 — READ-ONLY: stable deny reason when eligibility fails; null
   * while eligible regardless of opt-in state. Copy authored at the
   * call site per §γ — unknown values degrade to generic paused copy.
   */
  mentor_eligibility_reason?: MentorEligibilityReason | null;
}

/**
 * PATCH body — writable subset only. `mentor_listed` and
 * `mentor_eligibility_reason` are server-composed read-only state;
 * sending them would be silently ignored at best, so the type forbids it.
 */
export type PatchProfilePrefsBody = Partial<
  Omit<ProfilePrefs, "mentor_listed" | "mentor_eligibility_reason">
>;

export function getProfilePrefs(signal?: AbortSignal): Promise<ProfilePrefs> {
  const init: { method: "GET"; signal?: AbortSignal } = { method: "GET" };
  if (signal !== undefined) init.signal = signal;
  return bccFetchAsClient<ProfilePrefs>("me/profile-prefs", init);
}

export function patchProfilePrefs(
  body: PatchProfilePrefsBody,
): Promise<ProfilePrefs> {
  return bccFetchAsClient<ProfilePrefs>("me/profile-prefs", {
    method: "PATCH",
    body,
  });
}
