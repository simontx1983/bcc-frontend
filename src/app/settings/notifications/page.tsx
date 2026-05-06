/**
 * /settings/notifications — bell + email digest + push.
 *
 * Renders inside SettingsLayout (auth + persistent hero + nav).
 * NotificationPrefsForm is self-contained: fetches its own state via
 * React Query, owns its own save flow.
 */

import { NotificationPrefsForm } from "@/components/settings/NotificationPrefsForm";

import { SettingsSectionHeader } from "../_components/SettingsSectionHeader";

export default function NotificationSettingsPage() {
  return (
    <section className="mx-auto mt-10 max-w-3xl px-8">
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
