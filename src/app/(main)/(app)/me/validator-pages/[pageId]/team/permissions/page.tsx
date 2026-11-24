/**
 * /me/validator-pages/[pageId]/team/permissions — what each team role
 * may do on one validator page. Owner only (validator admin V1, PR B2).
 *
 * Server shell: signed-in only (anonymous viewers go through login and
 * come back here), and a page id that isn't a positive whole number is a
 * 404. Ownership is the API's call: a 403 renders "Only the owner can
 * change team permissions." inside the screen.
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { TeamPermissions } from "@/components/validator-team/TeamPermissions";
import { authOptions } from "@/lib/auth";

import { positiveId } from "../team-route";

interface PageProps {
  params: Promise<{ pageId: string }>;
}

export default async function ValidatorTeamPermissionsPage({ params }: PageProps) {
  const pageId = positiveId((await params).pageId);
  if (pageId === null) notFound();

  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect(
      `/login?callbackUrl=${encodeURIComponent(`/me/validator-pages/${pageId}/team/permissions`)}` as Route,
    );
  }

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-4xl px-4 pt-12 sm:px-8">
        <Link
          href={`/me/validator-pages/${pageId}/team` as Route}
          className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary hover:text-bcc-text"
        >
          ← TEAM
        </Link>
        <h1 className="bcc-stencil mt-2 text-4xl text-bcc-text md:text-5xl">Team permissions</h1>
        <p className="mt-3 max-w-2xl font-serif text-bcc-text-secondary">
          Choose what administrators and representatives can do on this page. The powers marked
          owner only always stay with you.
        </p>
      </section>

      <section className="mx-auto mt-6 max-w-4xl px-4 sm:px-8">
        <TeamPermissions pageId={pageId} />
      </section>
    </main>
  );
}
