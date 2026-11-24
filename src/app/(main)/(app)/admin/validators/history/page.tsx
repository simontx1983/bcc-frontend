/**
 * /admin/validators/history — global validator ownership audit history.
 *
 * Server shell that gates auth (redirects to login when no session).
 * Capability gating happens server-side (`manage_options`); a 403 renders
 * the "Admin access required" panel. Same shape as /admin/moderation.
 *
 * RelationshipHistory reads its filters from the URL (`useSearchParams`),
 * which Next 15 requires to sit inside a <Suspense> boundary.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminNav } from "@/components/admin/AdminNav";
import { ChainHealthBadge } from "@/components/admin/validators/ChainHealthBadge";
import { RelationshipHistory } from "@/components/admin/validators/RelationshipHistory";
import { SKELETON_CLASS } from "@/components/ui/Skeleton";
import { authOptions } from "@/lib/auth";

export default async function AdminValidatorHistoryPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/admin/validators/history");
  }

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-4xl px-6 pt-12 sm:px-8">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">
          ADMIN · VALIDATORS
        </span>
        <h1 className="bcc-stencil mt-2 text-4xl text-bcc-text md:text-5xl">
          Audit History
        </h1>
        <p className="mt-3 font-serif text-bcc-text-secondary">
          Every change to validator page ownership, newest first. Filter by
          page id or user id.
        </p>
        <AdminNav />
      </section>

      <section className="mx-auto mt-6 flex max-w-4xl flex-col gap-4 px-6 sm:px-8">
        <ChainHealthBadge />
        <Suspense fallback={<div aria-hidden className={SKELETON_CLASS + " h-52"} />}>
          <RelationshipHistory />
        </Suspense>
      </section>
    </main>
  );
}
