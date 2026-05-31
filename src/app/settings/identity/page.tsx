/**
 * /settings/identity — legacy redirect.
 *
 * V2 Phase 2.5 consolidated the settings pages: handle change moved to
 * /settings/profile, and login credentials (email + password + delete)
 * + linked accounts/wallets moved to /settings/account. This page
 * redirects to /settings/profile so any bookmarks or in-app links
 * still resolve.
 */

import { redirect } from "next/navigation";

export default function LegacyIdentitySettingsPage(): never {
  redirect("/settings/profile");
}
