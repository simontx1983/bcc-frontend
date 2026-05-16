/**
 * /locals/[slug] — single-Local detail page (per §E3).
 *
 * Server component. A Local is a semantic wrapper around a PeepSo
 * group; the detail surface composes two parallel SSR fetches:
 *
 *   - GET /bcc/v1/locals/:slug   → LocalDetailResponse (existence gate;
 *                                  404 → notFound. Carries local-flavor
 *                                  chain + number + viewer_membership.)
 *   - GET /bcc/v1/groups/:slug   → GroupDetailResponse (powers the
 *                                  unified shell; if it fails we
 *                                  degrade to a minimal local-only view
 *                                  so a transient group-read outage
 *                                  doesn't 500 the page.)
 *
 * Happy path: hand the GroupDetailResponse to `GroupDetailShell`
 * (the same unified FileRail + PageHero + GroupTabs grammar /groups and
 * /communities use). Inject `LocalMembershipControls` into the actions
 * slot — locals support set/clear primary semantics plain groups
 * don't, so we keep their dedicated control surface here.
 *
 * Degraded path: group fetch failed (transient 5xx, slug mismatch
 * between local + group view-models, etc). Render a minimal local-only
 * header + the LocalMembershipControls + a feed-unavailable notice.
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GroupDetailShell } from "@/components/groups/GroupDetailShell";
import { LocalMembershipControls } from "@/components/locals/LocalMembershipControls";
import { authOptions } from "@/lib/auth";
import { getGroup } from "@/lib/api/groups-detail-endpoints";
import { getLocal } from "@/lib/api/locals-endpoints";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function LocalDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const session = await getServerSession(authOptions);
  const token = session?.bccToken ?? null;

  // Parallel SSR fetches — independent so a failed group read doesn't
  // 500 the page when the local exists.
  const [localResult, groupResult] = await Promise.allSettled([
    getLocal(slug, token),
    getGroup(slug, token),
  ]);

  if (localResult.status === "rejected") {
    if (
      localResult.reason instanceof BccApiError
      && localResult.reason.status === 404
    ) {
      notFound();
    }
    throw localResult.reason;
  }

  const local = localResult.value;

  // Happy path — unified shell with LocalMembershipControls in actions.
  if (groupResult.status === "fulfilled") {
    return (
      <GroupDetailShell
        group={groupResult.value}
        initialTab="stream"
        backHref="/locals"
        backLabel="Locals"
        actions={
          <div className="bcc-panel flex flex-col gap-4 p-6">
            <h2 className="bcc-stencil text-xl text-ink">Your status here</h2>
            <p className="font-serif text-ink-soft">
              Join a Local to vote in its stream and bias your Floor feed.
              You can hold membership in many Locals at once; designate one as
              your primary to show it on your card. Switch any time.
            </p>
            <div>
              <LocalMembershipControls
                groupId={local.id}
                membership={local.viewer_membership}
              />
            </div>
          </div>
        }
      />
    );
  }

  // Degraded path — group fetch failed. Show local data + controls,
  // suppress the feed.
  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-3xl px-6 pt-12 sm:px-8">
        <Link
          href={"/locals" as Route}
          className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep hover:underline"
        >
          ← LOCALS
        </Link>

        <div className="mt-6">
          <span
            className="bcc-mono text-cardstock-deep"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            {local.chain !== null ? local.chain.toUpperCase() : "GENERAL"}
            {local.number !== null && (
              <>
                {" · "}#{local.number}
              </>
            )}
          </span>
          <h1 className="bcc-stencil mt-2 text-4xl text-cardstock md:text-5xl">
            {local.name}
          </h1>
          <p className="bcc-mono mt-3 text-cardstock-deep">
            {local.member_count} member{local.member_count === 1 ? "" : "s"}
          </p>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-3xl px-6 sm:px-8">
        <div className="bcc-panel flex flex-col gap-4 p-6">
          <h2 className="bcc-stencil text-xl text-ink">Your status here</h2>
          <p className="font-serif text-ink-soft">
            Join a Local to vote in its stream and bias your Floor feed.
            You can hold membership in many Locals at once; designate one as
            your primary to show it on your card. Switch any time.
          </p>
          <div>
            <LocalMembershipControls
              groupId={local.id}
              membership={local.viewer_membership}
            />
          </div>
        </div>
      </section>

      <section className="mx-auto mt-8 max-w-3xl px-6 sm:px-8">
        <div
          className="bcc-mono mb-4 flex items-center gap-3 text-cardstock-deep"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          <span className="inline-block h-px w-8 bg-cardstock-edge/50" />
          <span>THE LOCAL FEED</span>
          <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
        </div>
        <p
          role="status"
          className="bcc-panel font-serif text-ink-soft"
          style={{ padding: "1.5rem" }}
        >
          The feed is briefly unavailable. Refresh in a moment.
        </p>
      </section>
    </main>
  );
}
