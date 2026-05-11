/**
 * /locals/[slug] — single-Local detail page (per §E3).
 *
 * Server component. A Local is a semantic wrapper around a PeepSo group;
 * the detail surface composes two existing view-models in parallel:
 *
 *   - GET /bcc/v1/locals/:slug   → LocalDetailResponse (header + membership)
 *   - GET /bcc/v1/groups/:slug   → GroupDetailResponse (feed_visible +
 *                                  permissions, consumed by GroupFeedSection)
 *
 * The feed itself comes from /bcc/v1/groups/:id/feed via
 * <GroupFeedSection>'s internal useGroupFeed hook — no Local-specific
 * REST surface is introduced. Slug is identical across both routes
 * (PeepSo's `post_name`).
 *
 * V1 surface:
 *   - Header strip (chain · #number · name · member count)
 *   - Membership badge (★ PRIMARY / MEMBER / GUEST)
 *   - LocalMembershipControls (interactive — join, leave, set/clear primary)
 *   - GroupFeedSection (composer for members + cursor-paginated feed +
 *     server-authoritative feed_visible gating)
 *
 * Auth: anon allowed. When a session exists we forward the bearer to
 * both fetches so each response carries its viewer_membership block.
 *
 * Resilience: the two fetches are independent. If `/groups/:slug` fails
 * (transient 5xx or a slug that exists as a Local but mismatches the
 * group view-model), the header still renders and the feed slot shows
 * an inline notice — the page never returns 500 because the feed is
 * unreachable. A 404 from `/locals/:slug` still triggers Next's
 * notFound() (defines the page's existence).
 *
 * What's deferred:
 *   - Member roster
 *   - Closed-group join requests (V1 Locals are open by convention;
 *     `<GroupFeedSection>` still respects `feed_visible` for the day
 *     that changes)
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GroupFeedSection } from "@/components/groups/GroupFeedSection";
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

  // Parallel SSR fetches — independent results so a failed group read
  // never costs us the page header. The local result defines whether
  // the page exists at all (404 → notFound); the group result feeds
  // the GroupFeedSection slot.
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

  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-3xl px-6 pt-12 sm:px-8">
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
        <div className="bcc-mono mb-4 flex items-center gap-3 text-cardstock-deep">
          <span className="inline-block h-px w-8 bg-cardstock-edge/50" />
          <span>The Local feed</span>
          <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
        </div>
        {groupResult.status === "fulfilled" ? (
          <GroupFeedSection group={groupResult.value} />
        ) : (
          <FeedUnavailableNotice />
        )}
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

// Co-located non-blocking notice for the rare case where the parallel
// /groups/:slug fetch fails but /locals/:slug succeeded. Kept local to
// avoid premature promotion to /components — promote only if a second
// caller appears.
function FeedUnavailableNotice() {
  return (
    <div className="bcc-panel mx-auto p-6 text-center">
      <h2 className="bcc-stencil text-2xl text-ink">Feed unavailable</h2>
      <p className="mt-2 font-serif text-ink-soft">
        We couldn&apos;t load this Local&apos;s feed right now. Refresh to
        try again.
      </p>
    </div>
  );
}
