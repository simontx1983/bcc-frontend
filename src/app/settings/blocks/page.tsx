/**
 * /settings/blocks — §K1 Phase A blocked-users list.
 *
 * Server shell that gates auth and renders the client list. The list
 * fetches the current state via useMyBlocks and lets the user remove
 * blocks one by one.
 *
 * V1 surface: list view + per-row Unblock. Bulk-clear and search are
 * V1.5 polish — when a user has > 50 blocks the surface needs more
 * controls than V1 ships.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { BlocksList } from "@/components/settings/BlocksList";
import { SettingsNav } from "@/components/settings/SettingsNav";
import { authOptions } from "@/lib/auth";

export default async function BlocksSettingsPage() {
  const session = await getServerSession(authOptions);
  if (session === null) {
    redirect("/login?callbackUrl=/settings/blocks");
  }

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-2xl px-8 pt-12">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          SETTINGS · BLOCKS
        </span>
        <h1 className="bcc-stencil mt-2 text-4xl text-cardstock md:text-5xl">
          Blocked users
        </h1>
        <p className="mt-3 font-serif text-cardstock-deep">
          People you&apos;ve blocked. They don&apos;t see your posts on the
          Floor and you don&apos;t see theirs. Unblocking is one tap.
        </p>
      </section>

      <section className="mx-auto mt-6 max-w-2xl px-8">
        <SettingsNav />
      </section>

      <section className="mx-auto mt-6 max-w-2xl px-8">
        <BlocksList />
      </section>
    </main>
  );
}
