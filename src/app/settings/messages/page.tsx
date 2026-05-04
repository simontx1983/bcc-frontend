/**
 * /settings/messages — direct-message preferences (V2 Phase 2).
 *
 * Server-component shell. The MessagesPrefsForm is a client component
 * that fetches its own state via React Query (useMessagesPrefs); we
 * don't need to pass initial data down because the form's loading
 * state is brief and the mutation already lives in client space.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { MessagesPrefsForm } from "@/components/settings/MessagesPrefsForm";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { authOptions } from "@/lib/auth";

export default async function MessagesSettingsPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/settings/messages");
  }

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-2xl px-8 pt-12">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          SETTINGS · MESSAGES
        </span>
        <h1 className="bcc-stencil mt-2 text-4xl text-cardstock md:text-5xl">
          Messages
        </h1>
        <p className="mt-3 font-serif text-cardstock-deep">
          Who can start a direct conversation with you. These
          preferences apply immediately to incoming chat invitations.
        </p>
      </section>

      <section className="mx-auto mt-6 max-w-2xl px-8">
        <SettingsNav />
      </section>

      <section className="mx-auto mt-6 max-w-2xl px-8">
        <MessagesPrefsForm />
      </section>
    </main>
  );
}
