/**
 * Profile section visibility — the read side of the Edit About
 * "SHOW ON PROFILE" switches (umbrella #290 / bcc-trust #682).
 *
 * Nothing is decided here. A visitor's answer is the server's
 * `profile.sections`, already resolved for that viewer; the owner's own
 * hidden state is their `/me/profile-prefs`. This module only supplies the
 * documented defaults for an absent field (absent → visible) and names the
 * pref behind each section.
 */

import type { MemberProfile, MemberProfileSections } from "@/lib/api/types";
import type { ProfilePrefs } from "@/lib/api/profile-prefs-endpoints";

const ALL_VISIBLE: MemberProfileSections = {
  about: true,
  verifications: true,
  halls: true,
  operator: true,
  blogs: true,
  reviews: true,
  disputes: true,
};

/** `profile.sections`, or every section visible on a backend without it. */
export function resolveProfileSections(profile: MemberProfile): MemberProfileSections {
  return profile.sections ?? ALL_VISIBLE;
}

export type SectionPrefKey =
  | "show_about_on_profile"
  | "show_verifications_on_profile"
  | "show_groups_on_profile"
  | "show_operator_on_profile"
  | "show_blogs_on_profile"
  | "show_reviews_on_profile"
  | "show_disputes_on_profile";

/** Each pref is optional on the wire, and absent means shown. */
export function isSectionPrefShown(prefs: ProfilePrefs, key: SectionPrefKey): boolean {
  return prefs[key] !== false;
}
