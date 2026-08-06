/**
 * /halls/[slug] — single-Hall detail page (per §E3).
 *
 * Server component. A Hall is a semantic wrapper around a PeepSo
 * group; the detail surface composes two parallel SSR fetches:
 *
 *   - GET /bcc/v1/halls/:slug    → HallDetailResponse (existence gate;
 *                                  404 → notFound. Carries hall-flavor
 *                                  chain + viewer_membership.)
 *   - GET /bcc/v1/groups/:slug   → GroupDetailResponse (powers the
 *                                  unified shell; if it fails we
 *                                  degrade to a minimal hall-only view
 *                                  so a transient group-read outage
 *                                  doesn't 500 the page.)
 *
 * Happy path: hand the GroupDetailResponse to `GroupDetailShell`
 * (the same unified FileRail + PageHero + GroupTabs grammar /groups and
 * /communities use). Inject `HallMembershipControls` into the actions
 * slot — halls support set/clear primary semantics plain groups
 * don't, so we keep their dedicated control surface here.
 *
 * Degraded path: group fetch failed (transient 5xx, slug mismatch
 * between hall + group view-models, etc). Render a minimal hall-only
 * header + the HallMembershipControls + a feed-unavailable notice.
 */

import type { Metadata, Route } from "next";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";

import { GroupDetailShell } from "@/components/groups/GroupDetailShell";
import {
  HallCollectionsPanel,
  HallValidatorsPanel,
} from "@/components/halls/HallChainContent";
import { HallChainProfile } from "@/components/halls/HallChainProfile";
import { HallMembershipControls } from "@/components/halls/HallMembershipControls";
import { authOptions } from "@/lib/auth";
import { tokenFromSession } from "@/lib/api/client";
import { getGroup } from "@/lib/api/groups-detail-endpoints";
import { ANON_SSR_REVALIDATE_SECONDS } from "@/lib/api/cache-policy";
import { getHall } from "@/lib/api/halls-endpoints";
import { buildGroupMetadata } from "@/lib/og/group-metadata";
import { BccApiError } from "@/lib/api/types";

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * generateMetadata — OG / Twitter-card tags for a pasted /halls/[slug]
 * link. Shared builder (anon public fetch, no manual og:image — the
 * opengraph-image.tsx convention route owns it). A Hall is a wrapper over
 * the same group view-model, so the group fetch powers the preview copy.
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  return buildGroupMetadata({
    slug,
    pathPrefix: "/halls",
    kindLabel: "Hall",
  });
}

export default async function HallDetailPage({ params }: PageProps) {
  const { slug } = await params;

  const session = await getServerSession(authOptions);
  const token = tokenFromSession(session);

  // Parallel SSR fetches — independent so a failed group read doesn't
  // 500 the page when the hall exists.
  const [hallResult, groupResult] = await Promise.allSettled([
    getHall(slug, token),
    getGroup(
      slug,
      token,
      token === null ? { revalidate: ANON_SSR_REVALIDATE_SECONDS } : undefined,
    ),
  ]);

  if (hallResult.status === "rejected") {
    if (
      hallResult.reason instanceof BccApiError
      && hallResult.reason.status === 404
    ) {
      notFound();
    }
    throw hallResult.reason;
  }

  const hall = hallResult.value;

  // Happy path — unified shell with HallMembershipControls in actions.
  if (groupResult.status === "fulfilled") {
    return (
      <GroupDetailShell
        group={groupResult.value}
        initialTab="stream"
        sharePath={`/halls/${encodeURIComponent(slug)}`}
        backHref="/halls"
        backLabel="Halls"
        // Chain identity + "About this chain" block (contract v1.73,
        // additive) now lives INSIDE the About tab rather than a top-of-
        // page hero. Self-hides when the Hall has no chain_profile, so
        // chainless Halls + old backends look exactly as before. The empty
        // containerClassName lets it fill the About panel column (the 1440
        // gutter is already applied by the shell).
        aboutSupplement={
          <HallChainProfile
            chainProfile={hall.chain_profile}
            containerClassName=""
          />
        }
        actions={
          <div className="bcc-panel flex flex-col gap-4 p-6">
            <h2 className="bcc-stencil text-xl text-bcc-text">Your status here</h2>
            <p className="font-serif text-bcc-text-secondary">
              Join a Hall to vote in its stream and bias your Floor feed.
              You can hold membership in many Halls at once; designate one as
              your primary to show it on your card. Switch any time.
            </p>
            <div>
              <HallMembershipControls
                groupId={hall.id}
                membership={hall.viewer_membership}
              />
            </div>
          </div>
        }
        // Only pass a panel when there is something in it — GroupTabs
        // hides the tab otherwise, so a chain with nothing indexed shows
        // the usual three rather than two empty rooms.
        {...(hall.collections.length > 0
          ? {
              collectionsPanel: (
                <HallCollectionsPanel
                  chain={hall.chain}
                  collections={hall.collections}
                  collectionCount={hall.collection_count}
                />
              ),
            }
          : {})}
        {...(hall.validators.length > 0
          ? {
              validatorsPanel: (
                <HallValidatorsPanel
                  chain={hall.chain}
                  validators={hall.validators}
                  validatorCount={hall.validator_count}
                />
              ),
            }
          : {})}
      />
    );
  }

  // Degraded path — group fetch failed. Show hall data + controls,
  // suppress the feed.
  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-3xl px-2 pt-12 sm:px-3">
        <Link
          href={"/halls" as Route}
          className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep hover:underline"
        >
          ← HALLS
        </Link>

        <div className="mt-6">
          <span
            className="bcc-mono text-cardstock-deep"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            {hall.chain !== null ? hall.chain.toUpperCase() : "GENERAL"}
          </span>
          <h1 className="bcc-stencil mt-2 text-4xl text-cardstock md:text-5xl">
            {hall.name}
          </h1>
          <p className="bcc-mono mt-3 text-cardstock-deep">
            {hall.member_count} member{hall.member_count === 1 ? "" : "s"}
          </p>
        </div>
      </section>

      {/* Chain identity hero (contract v1.73, additive) — the group read
          failed but the hall (with chain_profile) succeeded, so the identity
          block still renders. Self-hides when chain_profile is absent/null. */}
      <div className="mt-8">
        <HallChainProfile
          chainProfile={hall.chain_profile}
          containerClassName="mx-auto max-w-3xl px-2 sm:px-3"
        />
      </div>

      <section className="mx-auto mt-8 max-w-3xl px-2 sm:px-3">
        <div className="bcc-panel flex flex-col gap-4 p-6">
          <h2 className="bcc-stencil text-xl text-bcc-text">Your status here</h2>
          <p className="font-serif text-bcc-text-secondary">
            Join a Hall to vote in its stream and bias your Floor feed.
            You can hold membership in many Halls at once; designate one as
            your primary to show it on your card. Switch any time.
          </p>
          <div>
            <HallMembershipControls
              groupId={hall.id}
              membership={hall.viewer_membership}
            />
          </div>
        </div>
      </section>

      {/*
        Degraded path: the group read failed, so there is no tab strip to
        put these in. The chain content does NOT depend on that read, so
        it still renders stacked — a Hall whose feed is down is still
        worth being in. Each panel self-hides when its list is empty.
      */}
      <section className="mx-auto mt-8 flex max-w-3xl flex-col gap-4 px-2 sm:px-3">
        <HallValidatorsPanel
          chain={hall.chain}
          validators={hall.validators}
          validatorCount={hall.validator_count}
        />
        <HallCollectionsPanel
          chain={hall.chain}
          collections={hall.collections}
          collectionCount={hall.collection_count}
        />
      </section>

      <section className="mx-auto mt-8 max-w-3xl px-2 sm:px-3">
        <div
          className="bcc-mono mb-4 flex items-center gap-3 text-cardstock-deep"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          <span className="inline-block h-px w-8 bg-cardstock-edge/50" />
          <span>THE HALL FEED</span>
          <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
        </div>
        <p
          role="status"
          className="bcc-panel font-serif text-bcc-text-secondary"
          style={{ padding: "1.5rem" }}
        >
          The feed is briefly unavailable. Refresh in a moment.
        </p>
      </section>
    </main>
  );
}
