/**
 * PrivacySettingsPanel — owner-only "Privacy" tab on /u/[handle].
 * Lifted from the retired /settings/privacy page.
 */

import { PrivacySettingsForm } from "@/components/settings/PrivacySettingsForm";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";
import { ProfilePrefsSection } from "@/components/settings/profile/ProfilePrefsSection";

export function PrivacySettingsPanel() {
  return (
    <section className="flex flex-col gap-10">
      <section>
        <SettingsSectionHeader
          eyebrow="VISIBILITY"
          title="Who can see what"
          blurb="Audience gate for your whole profile, default audience for posts on your wall, and your birthday year."
        />
        <div className="mt-4">
          <ProfilePrefsSection />
        </div>
      </section>

      <section>
        <SettingsSectionHeader
          eyebrow="HIDE FROM PROFILE"
          title="Per-field privacy"
          blurb="Toggle individual tabs, counts, and fields off your public profile. Saves on tap — no submit button."
        />
        <div className="mt-4">
          <PrivacySettingsForm />
        </div>
      </section>
    </section>
  );
}
