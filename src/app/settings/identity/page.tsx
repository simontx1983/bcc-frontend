/**
 * /settings/identity — handle + identity settings (per §Plan Phase 5).
 *
 * Server-component shell that gates auth and forwards the viewer's
 * current handle to the client form. Future siblings under /settings
 * (notifications, privacy, etc.) follow the same pattern.
 *
 * V1 surface: handle change only. Display name, primary local, and
 * privacy toggles land alongside their backing endpoints (no
 * speculative UI for fields the API can't yet update).
 *
 * Auth gate: redirect to /login with callbackUrl so the user lands
 * back here after signing in.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ConnectionsSection } from "@/components/settings/ConnectionsSection";
import { IdentitySettingsForm } from "@/components/settings/IdentitySettingsForm";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { WalletsSection } from "@/components/settings/WalletsSection";
import { authOptions } from "@/lib/auth";

export default async function IdentitySettingsPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/settings/identity");
  }

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-2xl px-8 pt-12">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          SETTINGS · IDENTITY
        </span>
        <h1 className="bcc-stencil mt-2 text-4xl text-cardstock md:text-5xl">
          Your identity
        </h1>
        <p className="mt-3 font-serif text-cardstock-deep">
          Your handle is how everyone on the Floor sees you. Change it
          carefully — there&apos;s a 7-day cooldown after each rename.
        </p>
      </section>

      <section className="mx-auto mt-6 max-w-2xl px-8">
        <SettingsNav />
      </section>

      <section className="mx-auto mt-6 max-w-2xl px-8">
        <IdentitySettingsForm currentHandle={session.user.handle} />
      </section>

      <section className="mx-auto mt-8 max-w-2xl px-8">
        <ConnectionsSection />
      </section>

      <section className="mx-auto mt-8 max-w-2xl px-8">
        <WalletsSection />
      </section>
    </main>
  );
}
