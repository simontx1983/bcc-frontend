/**
 * /settings/profile — bio + avatar + cover photo (V2 Phase 2).
 *
 * Server-component shell that gates auth, fetches the viewer's full
 * MemberProfile, and forwards bio + avatar + cover state to the
 * client form. After mutations the form calls router.refresh() so
 * this server component re-runs and other surfaces (header avatar,
 * profile page) stay in sync.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ProfileSettingsForm } from "@/components/settings/ProfileSettingsForm";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { getUser } from "@/lib/api/user-endpoints";
import { authOptions } from "@/lib/auth";

export default async function ProfileSettingsPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/settings/profile");
  }

  const token = typeof session.bccToken === "string" ? session.bccToken : null;
  const profile = await getUser(session.user.handle, token);

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-2xl px-8 pt-12">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          SETTINGS · PROFILE
        </span>
        <h1 className="bcc-stencil mt-2 text-4xl text-cardstock md:text-5xl">
          Profile + account
        </h1>
        <p className="mt-3 font-serif text-cardstock-deep">
          Bio, avatar, and cover photo. These appear on your public
          profile and anywhere your handle is rendered.
        </p>
      </section>

      <section className="mx-auto mt-6 max-w-2xl px-8">
        <SettingsNav />
      </section>

      <section className="mx-auto mt-6 max-w-2xl px-8">
        <ProfileSettingsForm initialProfile={profile} />
      </section>
    </main>
  );
}
