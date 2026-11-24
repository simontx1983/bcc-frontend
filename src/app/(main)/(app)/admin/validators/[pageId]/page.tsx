/**
 * /admin/validators/[pageId] — one validator page: its owner (link,
 * revoke, cancel behind the step-up) and its history. Validator admin
 * V1, PR B.
 *
 * Server shell that gates auth (redirects to login when no session).
 * Capability gating happens server-side at the API layer
 * (`manage_options`) — a 403 renders the "Admin access required" panel.
 * Same shape as /admin/validators. A page id that isn't a positive whole
 * number is a 404 here; an unknown one is the API's `bcc_not_found`.
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/AdminNav";
import { ValidatorPageAdmin } from "@/components/admin/validators/ValidatorPageAdmin";
import { authOptions } from "@/lib/auth";

interface PageProps {
  params: Promise<{ pageId: string }>;
}

export default async function AdminValidatorPagePage({ params }: PageProps) {
  const { pageId: raw } = await params;
  if (!/^\d+$/.test(raw)) notFound();
  const pageId = Number(raw);
  if (!Number.isSafeInteger(pageId) || pageId <= 0) notFound();

  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect(`/login?callbackUrl=/admin/validators/${pageId}` as Route);
  }

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-4xl px-6 pt-12 sm:px-8">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">
          ADMIN · VALIDATORS
        </span>
        <h1 className="bcc-stencil mt-2 text-4xl text-bcc-text md:text-5xl">Validator Page</h1>
        <p className="mt-3 font-serif text-bcc-text-secondary">
          Who owns this page, the evidence behind a staff link, and every change to it. Owners
          proven by a wallet or node key can only be changed by the owner.
        </p>
        <AdminNav />
      </section>

      <section className="mx-auto mt-6 max-w-4xl px-6 sm:px-8">
        <ValidatorPageAdmin pageId={pageId} />
      </section>
    </main>
  );
}
