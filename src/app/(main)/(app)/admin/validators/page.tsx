/**
 * /admin/validators — Validator Directory (validator admin V1, read-only).
 *
 * Server shell that gates auth (redirects to login when no session).
 * Capability gating happens server-side at the API layer
 * (`manage_options`) — the directory renders an "Admin access required"
 * panel when the API returns 403, rather than duplicating the capability
 * check here. Same shape as /admin/moderation.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { AdminNav } from "@/components/admin/AdminNav";
import { ValidatorDirectory } from "@/components/admin/validators/ValidatorDirectory";
import { authOptions } from "@/lib/auth";

export default async function AdminValidatorsPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/admin/validators");
  }

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-4xl px-6 pt-12 sm:px-8">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-bcc-text-secondary">
          ADMIN · VALIDATORS
        </span>
        <h1 className="bcc-stencil mt-2 text-4xl text-bcc-text md:text-5xl">
          Validator Directory
        </h1>
        <p className="mt-3 font-serif text-bcc-text-secondary">
          Every validator page, its ownership state, and who owns it. Wallet
          Verified owners proved control with a wallet signature; Verified by
          BCC owners were checked by staff.
        </p>
        <AdminNav />
      </section>

      <section className="mx-auto mt-6 max-w-4xl px-6 sm:px-8">
        <ValidatorDirectory />
      </section>
    </main>
  );
}
