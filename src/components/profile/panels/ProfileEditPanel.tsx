/**
 * ProfileEditPanel — the owner's real profile editor, mounted on the
 * "My Profile" tab of /u/[handle].
 *
 * Replaces the former ProfilePanel, which was a read-only SHADOW of the
 * settings surface: About / Wallets / Preference / Notifications /
 * Account sub-tabs whose selects and toggles were local `useState` and
 * saved nothing, with "edit" links pointing at routes that didn't exist.
 * It also rendered those personal-settings sub-tabs to *visitors*.
 *
 * This panel mounts the genuinely-wired editors that already existed
 * under /settings/profile — no new form code, no new endpoints:
 *   - ProfileHero          → avatar, cover photo, cover crop position
 *   - IdentitySettingsForm → handle (7-day cooldown)
 *   - ProfileFieldsList    → the admin-configured profile-field
 *                            catalogue, each with its own visibility
 *
 * Owner-only by construction: ProfileTabs registers this tab with
 * `ownerOnly: true`, so a visitor never sees it. Every mutation targets
 * session-scoped `/me/*` endpoints, so ownership is enforced server-side
 * regardless of what the client renders.
 */

import { IdentitySettingsForm } from "@/components/settings/IdentitySettingsForm";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { ProfileFieldsList } from "@/components/settings/profile/ProfileFieldsList";
import { ProfileHero } from "@/components/settings/profile/ProfileHero";
import type { MemberProfile } from "@/lib/api/types";

export interface ProfileEditPanelProps {
  profile: MemberProfile;
}

export function ProfileEditPanel({ profile }: ProfileEditPanelProps) {
  return (
    <section className="flex flex-col gap-10">
      {/* Cover + avatar + crop position. No `nav` slot — on the profile
          page the page's own tab strip is the navigation, so the hero
          renders bare. ProfileHero calls router.refresh() after each
          mutation, which revalidates this page's server component so the
          header card picks up the new avatar without a hard reload. */}
      <ProfileHero profile={profile} />

      <section>
        <SettingsSectionHeader
          eyebrow="IDENTITY"
          title="Your handle"
          blurb="How everyone on the Floor sees you. Handle changes have a 7-day cooldown."
        />
        <div className="mt-4">
          <IdentitySettingsForm currentHandle={profile.handle} />
        </div>
      </section>

      <section>
        <SettingsSectionHeader
          eyebrow="ABOUT"
          title="Profile fields"
          blurb="Each field is editable independently and can be set to public, members-only, or private."
        />
        <div className="mt-4">
          <ProfileFieldsList />
        </div>
      </section>
    </section>
  );
}
