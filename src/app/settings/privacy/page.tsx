/**
 * /settings/privacy — §K2 toggles UI.
 *
 * Server shell that gates auth and renders the client form. The form
 * fetches the current state via `useMyPrivacy` and PATCHes per-toggle
 * via `useUpdateMyPrivacy` (optimistic, error rollback handled there).
 *
 * Surface: 8 toggles in 3 sections (visibility on the Floor · personal
 * info · discovery). Each toggle is a single line with a label, a
 * one-sentence helper, and a switch.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { PrivacySettingsForm } from "@/components/settings/PrivacySettingsForm";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { authOptions } from "@/lib/auth";

export default async function PrivacySettingsPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/settings/privacy");
  }

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-2xl px-8 pt-12">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          SETTINGS · PRIVACY
        </span>
        <h1 className="bcc-stencil mt-2 text-4xl text-cardstock md:text-5xl">
          What&apos;s hidden
        </h1>
        <p className="mt-3 font-serif text-cardstock-deep">
          Defaults are public. Flip a switch to hide a tab, count, or
          field from everyone except yourself. Saves on tap — no submit
          button, no confirmation step.
        </p>
      </section>

      <section className="mx-auto mt-6 max-w-2xl px-8">
        <SettingsNav />
      </section>

      <section className="mx-auto mt-6 max-w-2xl px-8">
        <PrivacySettingsForm />
      </section>
    </main>
  );
}
