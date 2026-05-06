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
}

export type PatchProfilePrefsBody = Partial<ProfilePrefs>;

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
