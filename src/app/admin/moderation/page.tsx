/**
 * /admin/moderation — §K1 Phase C admin queue.
 *
 * Server shell that gates auth (redirects to login when no session).
 * Capability gating happens server-side at the API layer
 * (`manage_options`) — this page renders an "Admin access required"
 * error state when the API returns 403, rather than duplicating the
 * capability check in two places.
 *
 * V1 surface: pending / resolved / dismissed / all filter tabs +
 * per-row Hide / Dismiss / Restore actions. Pagination via offset
 * controls below the list.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { ModerationQueue } from "@/components/admin/ModerationQueue";
import { authOptions } from "@/lib/auth";

export default async function AdminModerationPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/admin/moderation");
  }

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-4xl px-8 pt-12">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          ADMIN · MODERATION
        </span>
        <h1 className="bcc-stencil mt-2 text-4xl text-cardstock md:text-5xl">
          Reports queue
        </h1>
        <p className="mt-3 font-serif text-cardstock-deep">
          Filed reports against feed posts. Hide takes the post off the
          Floor; Dismiss closes the report without action; Restore
          un-hides a previously-hidden post and closes the report.
        </p>
      </section>

      <section className="mx-auto mt-6 max-w-4xl px-8">
        <ModerationQueue />
      </section>
    </main>
  );
}
