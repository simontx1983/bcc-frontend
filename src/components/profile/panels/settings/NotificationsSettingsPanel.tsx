/**
 * NotificationsSettingsPanel — owner-only "Notifications" tab.
 * Lifted from the retired /settings/notifications page.
 */

import { NotificationPrefsForm } from "@/components/settings/NotificationPrefsForm";
import { SettingsSectionHeader } from "@/components/settings/SettingsSectionHeader";

export function NotificationsSettingsPanel() {
  return (
    <section>
      <SettingsSectionHeader
        eyebrow="NOTIFICATIONS"
        title="What reaches you"
        blurb="The bell shows what's happening in real time. The weekly digest catches you up over email if you'd rather glance once a week."
      />
      <div className="mt-4">
        <NotificationPrefsForm />
      </div>
    </section>
  );
}
