/**
 * /settings/notifications — §I1 notification preferences.
 *
 * Server-component shell; same auth-gate idiom as /settings/identity
 * and /settings/privacy. The form is a separate client component so
 * the page can stay statically renderable even as the form's state
 * lives in React Query land.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { NotificationPrefsForm } from "@/components/settings/NotificationPrefsForm";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { authOptions } from "@/lib/auth";

export default async function NotificationSettingsPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/settings/notifications");
  }

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-2xl px-8 pt-12">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          SETTINGS · NOTIFICATIONS
        </span>
        <h1 className="bcc-stencil mt-2 text-4xl text-cardstock md:text-5xl">
          What reaches you
        </h1>
        <p className="mt-3 font-serif text-cardstock-deep">
          The bell shows what&apos;s happening in real time. The weekly digest
          catches you up over email if you&apos;d rather glance once a week.
        </p>
      </section>

      <section className="mx-auto mt-6 max-w-2xl px-8">
        <SettingsNav />
      </section>

      <section className="mx-auto mt-6 max-w-2xl px-8">
        <NotificationPrefsForm />
      </section>
    </main>
  );
}
