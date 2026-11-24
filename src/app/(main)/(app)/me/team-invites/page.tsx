/**
 * /me/team-invites — the signed-in member's pending validator team
 * invites (validator admin V1, PR B2). The bell target for
 * `validator_team_invite`.
 *
 * Server shell: signed-in only; anonymous viewers go through login and
 * come back here.
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { MyTeamInvites } from "@/components/validator-team/MyTeamInvites";
import { authOptions } from "@/lib/auth";

export default async function MyTeamInvitesPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/me/team-invites")}` as Route);
  }

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-4xl px-4 pt-12 sm:px-8">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">
          YOUR TEAMS
        </span>
        <h1 className="bcc-stencil mt-2 text-4xl text-bcc-text md:text-5xl">Team invites</h1>
        <p className="mt-3 max-w-2xl font-serif text-bcc-text-secondary">
          Invites to help run a validator page. Accepting puts you on that page&apos;s team;
          declining tells the person who asked.
        </p>
      </section>

      <section className="mx-auto mt-6 max-w-4xl px-4 sm:px-8">
        <MyTeamInvites />
      </section>
    </main>
  );
}
