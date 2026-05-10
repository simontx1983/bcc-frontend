/**
 * /groups/[slug] — single-group detail page (per §4.7.5 / §4.7.6 /
 * §4.7.7).
 *
 * Server component. Fetches the cross-kind view-model from
 * `GET /bcc/v1/groups/{slug}`; missing slug AND secret-non-member both
 * surface as 404 → Next's `notFound()` (per §S defense-in-depth, the
 * server NEVER distinguishes the two on the wire).
 *
 * Composition mirrors the brutalist primitives in `globals.css`. Hero
 * + membership strip span the full content width; below them, feed and
 * roster split into a two-column layout at the `lg` breakpoint
 * (1024px+) so the roster doesn't get buried under a long feed:
 *
 *   bcc-rail (sticky top)            ← / GROUPS · TYPE LABEL · VERIFICATION
 *   GroupHero                        cover · kicker · stencil · meta strip
 *   GroupMembershipStrip             bcc-paper + kind-dispatched join/leave
 *
 *   ┌──────────────── lg+ two-column ────────────────┐
 *   │  ── THE GROUP FEED ──   ── ON ROSTER ──        │
 *   │  GroupFeedSection       GroupMembersStrip      │
 *   │  (feed cards · paginate) (sticky sidebar 320px)│
 *   └─────────────────────────────────────────────────┘
 *
 * Below `lg`: single column, roster renders FIRST in DOM order (so the
 * page surfaces the membership card before forcing a long scroll past
 * the feed). On `lg`+ the grid explicitly places feed in column 1,
 * roster in column 2 (`lg:col-start-2 lg:row-start-1`) so the visual
 * order matches reading direction.
 *
 * Stage-reveal stagger (50ms increments) is owned by `bcc-stage-reveal`
 * + the `--stagger` custom property set per-section. Reduced motion is
 * gated globally in `globals.css:115-121` — no manual gate needed.
 *
 * Auth: anon allowed. When a session exists we forward the bearer so
 * the response carries populated `viewer_membership` + `permissions`
 * blocks (per-viewer state).
 */

import type { Route } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GroupFeedSection } from "@/components/groups/GroupFeedSection";
import { GroupHero } from "@/components/groups/GroupHero";
import { GroupMembershipStrip } from "@/components/groups/GroupMembershipStrip";
import { GroupMembersStrip } from "@/components/groups/GroupMembersStrip";
import { VerificationBadge } from "@/components/groups/VerificationBadge";
import { authOptions } from "@/lib/auth";
import { getGroup } from "@/lib/api/groups-detail-endpoints";
import { BccApiError, type GroupDetailResponse } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

const TYPE_RAIL_LABEL: Record<GroupDetailResponse["type"], string> = {
  nft:    "HOLDERS",
  local:  "LOCAL",
  system: "SYSTEM",
  user:   "COMMUNITY",
};

export default async function GroupDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const session = await getServerSession(authOptions);
  const token = session?.bccToken ?? null;

  let group: GroupDetailResponse;
  try {
    group = await getGroup(slug, token);
  } catch (err) {
    if (err instanceof BccApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }

  return (
    <main className="min-h-screen pb-24">
      {/* Sticky brutalist rail — back link + breadcrumb. */}
      <div className="sticky top-0 z-30 border-b border-cardstock-edge/40 bg-concrete/85 backdrop-blur">
        <div className="bcc-rail mx-auto max-w-3xl px-6 py-3 sm:px-8">
          <Link
            href={"/communities" as Route}
            className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep hover:text-cardstock"
          >
            ← GROUPS
          </Link>
          <span aria-hidden className="bcc-mono text-cardstock-deep" style={{ fontSize: "10px" }}>
            ·
          </span>
          <span
            className="bcc-mono uppercase text-cardstock-deep"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            {TYPE_RAIL_LABEL[group.type]}
          </span>
          {group.verification !== null && (
            <>
              <span aria-hidden className="bcc-mono text-cardstock-deep" style={{ fontSize: "10px" }}>
                ·
              </span>
              <span className="bcc-mono text-[10px]">
                <VerificationBadge label={group.verification.label} />
              </span>
            </>
          )}
        </div>
      </div>

      {/* Hero block — cover + kicker + name + meta. */}
      <section className="mx-auto max-w-6xl px-6 pt-8 sm:px-8">
        <GroupHero group={group} />
      </section>

      {/* Membership strip — kind-dispatched join/leave or unlock_hint.
          Stays full-width above the split so the join CTA is the first
          interactive surface a visitor sees regardless of viewport. */}
      <section className="mx-auto mt-10 max-w-6xl px-6 sm:px-8">
        <GroupMembershipStrip group={group} />
      </section>

      {/* Split: feed (main column) + roster (sticky sidebar) at lg+.
          Below lg, single column with roster FIRST in DOM order so it
          surfaces before a long feed scroll. The grid placement classes
          (lg:col-start-2 / lg:col-start-1) flip the visual order on lg+
          back to feed-left, roster-right.

          The aside is `lg:sticky lg:top-24` so it docks below the rail
          (the rail is sticky at top-0; top-24 = 6rem leaves room for it
          plus a comfortable margin). `lg:self-start` is required for
          sticky to engage inside a CSS grid — without it the aside
          stretches to full row height and never scrolls relative to
          the parent. */}
      <div className="mx-auto mt-12 max-w-6xl px-6 grid gap-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* Roster — second column on lg+, first in DOM for narrow. */}
        <aside
          className="bcc-stage-reveal lg:col-start-2 lg:row-start-1 lg:sticky lg:top-24 lg:self-start"
          style={{ ["--stagger" as string]: "200ms" }}
        >
          <SectionRule label="On roster" />
          <GroupMembersStrip group={group} />
        </aside>

        {/* Feed — main column on lg+, second in DOM (after roster). */}
        <section
          className="bcc-stage-reveal lg:col-start-1 lg:row-start-1"
          style={{ ["--stagger" as string]: "150ms" }}
        >
          <SectionRule label="The group feed" />
          <GroupFeedSection group={group} />
        </section>
      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Section rule — dashed-rule label that matches the locals page's
// inline rule strip. Kept inline (not a shared component) because both
// callers want subtly different paddings; a shared primitive would
// over-fit a single use site.
// ─────────────────────────────────────────────────────────────────────

function SectionRule({ label }: { label: string }) {
  return (
    <div className="bcc-mono mb-5 flex items-center gap-3 text-cardstock-deep">
      <span className="inline-block h-px w-8 bg-cardstock-edge/50" />
      <span style={{ fontSize: "10px", letterSpacing: "0.24em" }}>
        {label.toUpperCase()}
      </span>
      <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
    </div>
  );
}
