/**
 * /settings/profile — public-facing identity editor.
 *
 * Renders inside SettingsLayout (which provides the persistent hero +
 * nav). This file is content-only: handle change + admin-configured
 * profile fields catalogue. Both sections live here because they're
 * both "how you appear on the Floor".
 */

import { getServerSession } from "next-auth";

import { IdentitySettingsForm } from "@/components/settings/IdentitySettingsForm";
import { ProfileFieldsList } from "@/components/settings/profile/ProfileFieldsList";
import { authOptions } from "@/lib/auth";

import { SettingsSectionHeader } from "../_components/SettingsSectionHeader";

export default async function ProfileSettingsPage() {
  // Layout already redirects on null — the assertion just narrows the
  // type so we can read session.user.handle without a guard.
  const session = await getServerSession(authOptions);
  const handle = session?.user.handle ?? "";

  return (
    <>
      <section className="mx-auto mt-10 max-w-3xl px-6 sm:px-8">
        <SettingsSectionHeader
          eyebrow="IDENTITY"
          title="Your handle"
          blurb="How everyone on the Floor sees you. Handle changes have a 7-day cooldown."
        />
        <div className="mt-4">
          <IdentitySettingsForm currentHandle={handle} />
        </div>
      </section>

      <section className="mx-auto mt-10 max-w-3xl px-6 sm:px-8">
        <SettingsSectionHeader
          eyebrow="ABOUT"
          title="Profile fields"
          blurb="Each field is editable independently and can be set to public, members-only, or private."
        />
        <div className="mt-4">
          <ProfileFieldsList />
        </div>
      </section>
    </>
  );
}
