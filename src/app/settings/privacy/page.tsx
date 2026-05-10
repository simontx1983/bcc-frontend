/**
 * /settings/privacy — visibility + privacy flags.
 *
 * Two sections: profile-wide visibility (write `usr_profile_acc`,
 * post defaults, hide-bday-year) and the §K2 per-field hide toggles.
 * Both answer "what's hidden from others" so they share a page.
 *
 * Renders inside SettingsLayout (auth + persistent hero + nav).
 */

import { PrivacySettingsForm } from "@/components/settings/PrivacySettingsForm";
import { ProfilePrefsSection } from "@/components/settings/profile/ProfilePrefsSection";

import { SettingsSectionHeader } from "../_components/SettingsSectionHeader";

export default function PrivacySettingsPage() {
  return (
    <>
      <section className="mx-auto mt-10 max-w-3xl px-6 sm:px-8">
        <SettingsSectionHeader
          eyebrow="VISIBILITY"
          title="Who can see what"
          blurb="Audience gate for your whole profile, default audience for posts on your wall, and your birthday year."
        />
        <div className="mt-4">
          <ProfilePrefsSection />
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-3xl px-6 sm:px-8">
        <SettingsSectionHeader
          eyebrow="HIDE FROM PROFILE"
          title="Per-field privacy"
          blurb="Toggle individual tabs, counts, and fields off your public profile. Saves on tap — no submit button."
        />
        <div className="mt-4">
          <PrivacySettingsForm />
        </div>
      </section>
    </>
  );
}
