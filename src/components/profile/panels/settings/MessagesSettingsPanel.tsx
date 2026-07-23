/**
 * MessagesSettingsPanel — owner-only "Messages" tab.
 * Lifted from the retired /settings/messages page.
 */

import { MessagesPrefsForm } from "@/components/settings/MessagesPrefsForm";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export function MessagesSettingsPanel() {
  return (
    <section>
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
