/**
 * /settings/messages — direct-message preferences.
 *
 * Renders inside SettingsLayout (auth + persistent hero + nav).
 * MessagesPrefsForm is self-contained.
 */

import { MessagesPrefsForm } from "@/components/settings/MessagesPrefsForm";

import { SettingsSectionHeader } from "../_components/SettingsSectionHeader";

export default function MessagesSettingsPage() {
  return (
    <section className="mx-auto mt-10 max-w-3xl px-8">
      <SettingsSectionHeader
        eyebrow="MESSAGES"
        title="Who can message you"
        blurb="Who can start a direct conversation with you. Saves immediately — applies to incoming chat invitations on your next render."
      />
      <div className="mt-4">
        <MessagesPrefsForm />
      </div>
    </section>
  );
}
