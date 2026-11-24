/**
 * CommunityDetail — the one detail page for every community, Halls
 * included (Site Structure A). /communities/[slug] and its /about and
 * /members sub-routes all render through here; /halls/[slug] forwards to
 * /communities/[slug] (src/lib/route-moves.ts). A Hall's slug IS its
 * PeepSo group slug, so the forward is 1:1.
 *
 * Server component. `GET /groups/{slug}` (§4.7.5) powers the unified
 * shell for every kind. When the group is a Hall, `GET /halls/{slug}`
 * adds what only Halls have:
 *   - HallMembershipControls (set / clear primary) in the actions slot,
 *     in place of the plain join strip;
 *   - the chain identity block inside the About tab;
 *   - the NFT Collections and Validators tabs, each only when it has
 *     something in it. They stay in-page tabs: there are no sub-routes
 *     for them (GroupTabs).
 *
 * Failure handling, kept from the former /halls/[slug] page:
 *   - group read fails, Hall read succeeds → a minimal Hall view (header,
 *     controls, chain content, a feed-unavailable notice), so a transient
 *     group-read outage doesn't take a Hall down;
 *   - both fail → a 404 stays a 404 (`notFound()`); anything else throws.
 *     The server returns 404 for both "missing" AND "secret + non-member"
 *     on purpose; never distinguish them (§S);
 *   - the group is a Hall but the Hall read fails → the plain community
 *     view, which still works (join, stream, about, members).
 *
 * As before the move, only the stream route caches the anonymous read
 * (`ANON_SSR_REVALIDATE_SECONDS`) and offers Share.
 */

import { getServerSession } from "next-auth";
import Link from "next/link";
import { notFound } from "next/navigation";

import { SideBlock } from "@/components/detail/DetailLayout";
import { GroupDetailShell } from "@/components/groups/GroupDetailShell";
import {
  HallCollectionsPanel,
  HallValidatorsPanel,
} from "@/components/halls/HallChainContent";
import { HALLS_TAB_HREF } from "@/components/communities/halls-tab-href";
import { HallChainProfile } from "@/components/halls/HallChainProfile";
import { HallMembershipControls } from "@/components/halls/HallMembershipControls";
import { authOptions } from "@/lib/auth";
import { tokenFromSession } from "@/lib/api/client";
import { getGroup } from "@/lib/api/groups-detail-endpoints";
import { ANON_SSR_REVALIDATE_SECONDS } from "@/lib/api/cache-policy";
import { getHall } from "@/lib/api/halls-endpoints";
import { BccApiError } from "@/lib/api/types";
import type { GroupDetailResponse, HallDetailResponse } from "@/lib/api/types";

/** The routed tabs. Collections and Validators are in-page only. */
export type CommunityRouteTab = "stream" | "about" | "members";

export async function CommunityDetail({
  slug,
  initialTab,
}: {
  slug: string;
  initialTab: CommunityRouteTab;
}) {
  const isStream = initialTab === "stream";

  const session = await getServerSession(authOptions);
  const token = tokenFromSession(session);

  let group: GroupDetailResponse;
  try {
    group = await getGroup(
      slug,
      token,
      isStream && token === null ? { revalidate: ANON_SSR_REVALIDATE_SECONDS } : undefined,
    );
  } catch (groupErr) {
    // A Hall can still render from its own read.
    const hall = await getHall(slug, token).catch(() => null);
    if (hall !== null) {
      return <DegradedHallView hall={hall} />;
    }
    if (groupErr instanceof BccApiError && groupErr.status === 404) {
      notFound();
    }
    throw groupErr;
  }

  const hall = group.type === "hall" ? await getHall(slug, token).catch(() => null) : null;
  const urlBase = `/communities/${slug}`;
  const sharePath = isStream ? `/communities/${encodeURIComponent(slug)}` : undefined;

  if (hall === null) {
    return (
      <GroupDetailShell
        group={group}
        initialTab={initialTab}
        urlBase={urlBase}
        {...(sharePath !== undefined ? { sharePath } : {})}
        backHref="/communities"
        backLabel="Communities"
      />
    );
  }

  return (
    <GroupDetailShell
      group={group}
      initialTab={initialTab}
      urlBase={urlBase}
      {...(sharePath !== undefined ? { sharePath } : {})}
      backHref={HALLS_TAB_HREF}
      backLabel="Halls"
      // Chain identity + "About this chain" block (contract v1.73,
      // additive) lives INSIDE the About tab. Self-hides when the Hall
      // has no chain_profile. The empty containerClassName lets it fill
      // the About panel column (the shell already applies the gutter).
      aboutSupplement={
        <HallChainProfile chainProfile={hall.chain_profile} containerClassName="" />
      }
      // The detail header carries the controls themselves (join, primary
      // set / clear); what they mean sits in the side column.
      actions={<HallMembershipControls groupId={hall.id} membership={hall.viewer_membership} />}
      side={
        <SideBlock title="Your status here">
          <p className="text-[15px] leading-relaxed text-bcc-text-secondary">{HALL_STATUS_COPY}</p>
        </SideBlock>
      }
      // Only pass a panel when there is something in it — GroupTabs hides
      // the tab otherwise, so a chain with nothing indexed shows the usual
      // three rather than two empty rooms.
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

/** What a Hall's membership controls mean. */
const HALL_STATUS_COPY =
  "Join a Hall to vote in its stream and bias your Floor feed. You can hold membership in many Halls at once; designate one as your primary to show it on your card. Switch any time.";

/** "Your status here" as one panel: the degraded view, which has no header. */
function HallStatusPanel({ hall }: { hall: HallDetailResponse }) {
  return (
    <div className="bcc-panel flex flex-col gap-4 p-6">
      <h2 className="bcc-stencil text-xl text-bcc-text">Your status here</h2>
      <p className="font-serif text-bcc-text-secondary">{HALL_STATUS_COPY}</p>
      <div>
        <HallMembershipControls groupId={hall.id} membership={hall.viewer_membership} />
      </div>
    </div>
  );
}

/**
 * The group read failed but the Hall read worked: show the Hall's data
 * and controls, suppress the feed.
 */
function DegradedHallView({ hall }: { hall: HallDetailResponse }) {
  return (
    <main className="min-h-screen pb-24">
      <section className="mx-auto max-w-3xl px-2 pt-12 sm:px-3">
        <Link
          href={HALLS_TAB_HREF}
          className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary hover:underline"
        >
          ← HALLS
        </Link>

        <div className="mt-6">
          <span
            className="bcc-mono text-bcc-text-secondary"
            style={{ fontSize: "10px", letterSpacing: "0.24em" }}
          >
            {hall.chain !== null ? hall.chain.toUpperCase() : "GENERAL"}
          </span>
          <h1 className="bcc-stencil mt-2 text-4xl text-bcc-text md:text-5xl">
            {hall.name}
          </h1>
          <p className="bcc-mono mt-3 text-bcc-text-secondary">
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
        <HallStatusPanel hall={hall} />
      </section>

      {/*
        There is no tab strip to put these in. The chain content does NOT
        depend on the group read, so it still renders stacked — a Hall whose
        feed is down is still worth being in. Each panel self-hides when its
        list is empty.
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
          className="bcc-mono mb-4 flex items-center gap-3 text-bcc-text-secondary"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          <span className="inline-block h-px w-8 bg-bcc-border" />
          <span>THE HALL FEED</span>
          <span className="inline-block h-px flex-1 bg-bcc-border" />
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
