/**
 * /settings/* shared layout — auth gate + section nav.
 *
 * Every remaining settings page (privacy, notifications, messages,
 * communities, showcase, account, blocks) renders inside this layout.
 *
 * The ProfileHero (cover banner + avatar overlay + crop position) used
 * to live here, so avatar/cover editing appeared on every settings tab.
 * That editor has moved to the owner-only "My Profile" tab on
 * /u/[handle] — keeping it here as well would mean two live places to
 * change the same asset. With the hero gone, the layout no longer needs
 * to fetch the profile at all; it is now just the auth gate + nav.
 *
 * This route group is being dissolved into owner-gated profile tabs;
 * once the remaining editors move, the whole group is deleted.
 *
 * Auth gate lives here so individual pages can assume `session !== null`.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { SettingsNav } from "@/components/settings/SettingsNav";
import { authOptions } from "@/lib/auth";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/settings/account");
  }

  return (
    <main className="min-h-screen pb-24 pt-8">
      <section className="mx-auto max-w-3xl px-6 sm:px-8">
        <SettingsNav />
      </section>

      {children}
    </main>
  );
}
