/**
 * /me/validator-pages/[pageId]/team — one validator page's team, for a
 * signed-in member (validator admin V1, PR B2).
 *
 * Server shell: signed-in only (an anonymous viewer goes through login
 * and comes back here, `?revert=` included), and a page id that isn't a
 * positive whole number is a 404. What the viewer may see and do is the
 * API's call (route 5's `viewer` and `can`); a 403 or an unknown page
 * renders inside the screen.
 *
 * `?revert=<eventId>` is the owner's email deep link: the screen opens
 * on that change with an "Undo this change" button. Nothing runs on
 * load; only the click POSTs.
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { ValidatorTeamScreen } from "@/components/validator-team/ValidatorTeamScreen";
import { authOptions } from "@/lib/auth";

import { positiveId } from "./team-route";

interface PageProps {
  params: Promise<{ pageId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ValidatorTeamPage({ params, searchParams }: PageProps) {
  const pageId = positiveId((await params).pageId);
  if (pageId === null) notFound();
  const rawRevert = (await searchParams)["revert"];
  const revertEventId = positiveId(rawRevert);

  const session = await getServerSession(authOptions);
  if (session === null) {
    const back =
      revertEventId !== null
        ? `/me/validator-pages/${pageId}/team?revert=${revertEventId}`
        : `/me/validator-pages/${pageId}/team`;
    redirect(`/login?callbackUrl=${encodeURIComponent(back)}` as Route);
  }

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-4xl px-4 pt-12 sm:px-8">
        <Link
          href={"/me/validator-pages" as Route}
          className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary hover:text-bcc-text"
        >
          ← YOUR VALIDATOR PAGES
        </Link>
        <h1 className="bcc-stencil mt-2 text-4xl text-bcc-text md:text-5xl">Team</h1>
        <p className="mt-3 max-w-2xl font-serif text-bcc-text-secondary">
          Who helps run this validator page, and what each of them can do. Every role starts
          as an invite and counts once it&apos;s accepted.
        </p>
      </section>

      <section className="mx-auto mt-6 max-w-4xl px-4 sm:px-8">
        <ValidatorTeamScreen pageId={pageId} revertEventId={revertEventId} />
      </section>
    </main>
  );
}
