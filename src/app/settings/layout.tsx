/**
 * /settings/* shared layout — persistent hero + integrated nav.
 *
 * Every settings page (profile, privacy, notifications, messages,
 * account, blocks) renders inside this layout. The hero (cover banner
 * + avatar overlay + identity caption + the SettingsNav tab strip)
 * stays fixed at the top of the route segment — when the user clicks
 * between settings tabs, only the content area below re-renders.
 *
 * Auth gate lives here so individual pages can assume `session !== null`.
 *
 * Profile data fetched server-side once per navigation; `router.refresh()`
 * (called from ProfileHero on avatar/cover mutations) revalidates this
 * layout so the hero shows the latest cover/avatar without a hard reload.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { SettingsNav } from "@/components/settings/SettingsNav";
import { ProfileHero } from "@/components/settings/profile/ProfileHero";
import { getUser } from "@/lib/api/user-endpoints";
import { authOptions } from "@/lib/auth";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/settings/profile");
  }

  const token = typeof session.bccToken === "string" ? session.bccToken : null;
  const profile = await getUser(session.user.handle, token);

  return (
    <main className="min-h-screen pb-24 pt-8">
      <section className="mx-auto max-w-3xl px-6 sm:px-8">
        <ProfileHero profile={profile} nav={<SettingsNav />} />
      </section>

      {children}
    </main>
  );
}
