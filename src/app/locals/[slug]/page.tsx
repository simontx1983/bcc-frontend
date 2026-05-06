/**
 * /locals/[slug] — single-Local detail page (per §E3).
 *
 * Server component. Fetches the §4.7 single-item view-model from
 * GET /bcc/v1/locals/:slug; missing slug → Next's `notFound()`.
 *
 * V1 surface:
 *   - Header strip (chain · #number · name · member count)
 *   - Membership badge (★ PRIMARY / MEMBER / GUEST)
 *   - LocalMembershipControls (interactive — join, leave, set/clear primary)
 *   - Empty placeholder for the Local's stream feed (§E3 deferred)
 *
 * Auth: anon allowed. When a session exists we forward the bearer so
 * the response carries the populated viewer_membership block.
 *
 * What's deferred:
 *   - Local-scoped feed (needs FeedRankingService scope filter)
 *   - Member roster
 *   - Closed-group join requests (V1 Locals are open by convention)
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";

import { LocalMembershipControls } from "@/components/locals/LocalMembershipControls";
import { authOptions } from "@/lib/auth";
import { getLocal } from "@/lib/api/locals-endpoints";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

export default async function LocalDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const session = await getServerSession(authOptions);
  const token = session?.bccToken ?? null;

  let local;
  try {
    local = await getLocal(slug, token);
  } catch (err) {
    if (err instanceof BccApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-3xl px-8 pt-12">
        <Link
          href={"/locals" as Route}
          className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep hover:underline"
        >
          ← LOCALS
        </Link>

        <div className="mt-6 flex flex-wrap items-baseline justify-between gap-4">
          <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
            {local.chain !== null ? local.chain.toUpperCase() : "GENERAL"}
            {local.number !== null && (
              <>
                {" · "}#{local.number}
              </>
            )}
          </span>
          <MembershipPill membership={local.viewer_membership} />
        </div>

        <h1 className="bcc-stencil mt-2 text-4xl text-cardstock md:text-5xl">
          {local.name}
        </h1>

        <p className="bcc-mono mt-3 text-cardstock-deep">
          {local.member_count} member{local.member_count === 1 ? "" : "s"}
        </p>
      </section>

      <section className="mx-auto mt-8 max-w-3xl px-8">
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

      <section className="mx-auto mt-8 max-w-3xl px-8">
        <div className="bcc-mono mb-4 flex items-center gap-3 text-cardstock-deep">
          <span className="inline-block h-px w-8 bg-cardstock-edge/50" />
          <span>The Local feed</span>
          <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
        </div>
        <div className="bcc-panel mx-auto p-6 text-center">
          <h2 className="bcc-stencil text-2xl text-ink">Coming soon</h2>
          <p className="mt-2 font-serif text-ink-soft">
            Posts, releases, and announcements scoped to this Local will
            land here. For now, keep tabs on members and cards from the
            directory.
          </p>
        </div>
      </section>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────

function MembershipPill({
  membership,
}: {
  membership: { is_member: boolean; is_primary: boolean } | null;
}) {
  if (membership === null) {
    return (
      <span
        className="bcc-mono rounded-sm px-2 py-0.5 text-[10px] tracking-[0.18em] text-cardstock-deep"
        style={{
          background: "rgba(15,13,9,0.06)",
          border: "1px solid rgba(15,13,9,0.16)",
        }}
      >
        GUEST
      </span>
    );
  }
  if (!membership.is_member) {
    return (
      <span
        className="bcc-mono rounded-sm px-2 py-0.5 text-[10px] tracking-[0.18em] text-cardstock-deep"
        style={{
          background: "rgba(15,13,9,0.06)",
          border: "1px solid rgba(15,13,9,0.16)",
        }}
      >
        NOT A MEMBER
      </span>
    );
  }
  if (membership.is_primary) {
    return (
      <span
        className="bcc-mono rounded-sm px-2 py-0.5 text-[10px] tracking-[0.18em]"
        style={{
          color: "var(--verified)",
          background: "rgba(44,157,102,0.10)",
          border: "1px solid rgba(44,157,102,0.32)",
        }}
      >
        ★ PRIMARY
      </span>
    );
  }
  return (
    <span
      className="bcc-mono rounded-sm px-2 py-0.5 text-[10px] tracking-[0.18em] text-ink"
      style={{
        background: "rgba(15,13,9,0.06)",
        border: "1px solid rgba(15,13,9,0.16)",
      }}
    >
      MEMBER
    </span>
  );
}
