"use client";

/**
 * ProfileTabs — the bottom-of-profile tab strip with the active panel.
 *
 * Tabs: Watching · Reviews · Activity · Disputes · Groups · Network.
 * The Blog entry sits beside the tab strip as a Link (it's a separate
 * route per §D6, not a panel).
 *
 * Decoupled from Phase4MemberProfile per the V1.5 refactor: the
 * component now takes `handle` + `displayName` directly so a §3.1
 * profile page can mount it without supplying the full speculative
 * super-shape. When `tabs` (Phase-4 metadata) is supplied, per-tab
 * count badges + PRIVATE chips render in the strip; when it's
 * omitted, the default 5-tab list renders with no count badges and
 * the panels' own hidden-state handle privacy.
 *
 * Each panel lazy-fetches via handle on activation (useUserReviews /
 * useUserDisputes), so the strip stays cheap to mount — no upfront
 * cost beyond the chip rendering.
 *
 * `?tab=<key>` is the AUTHORITATIVE tab state: the active tab is seeded
 * from the URL and every click syncs it back, so tabs are deep-linkable,
 * shareable and refresh-safe. This is the foundation the settings-absorbs
 * -into-profile migration needs — retired /settings/* URLs redirect to
 * `/u/me?tab=<key>`.
 *
 * We sync with the native History API (`replaceState`), not
 * `router.replace`, on purpose:
 *   - `router.replace` would re-run the server component on every tab
 *     click (a fresh `getUser` round-trip + panel flash).
 *   - `replaceState` adds no history entry, so Back leaves the profile
 *     instead of walking backwards through twelve tabs.
 * Next 15 propagates History updates to `useSearchParams`.
 */

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Skeleton } from "@/components/ui/Skeleton";
import type { MeReliabilityResponse, MemberLiving, MemberProfile, MemberProgression, MemberTabCount } from "@/lib/api/types";

import { CardReviewsPanel } from "@/components/entity/panels/CardReviewsPanel";

import { ActivityPanel } from "./panels/ActivityPanel";
import { BackingPanel } from "./panels/BackingPanel";
import { ComingSoonPanel } from "./panels/ComingSoonPanel";
import { DisputesPanel } from "./panels/DisputesPanel";
import { GroupsPanel } from "./panels/GroupsPanel";
import { PhotosPanel } from "./panels/PhotosPanel";
import { ProfilePanel } from "./panels/ProfilePanel";
import { ReviewsPanel } from "./panels/ReviewsPanel";
import { SetupPanel } from "./panels/SetupPanel";
import { WatchingPanel } from "./panels/WatchingPanel";

// Code-split — BlogPanel drags in the whole long-form chain (composer,
// react-markdown, remark/rehype plugins, the Shiki highlighter) and
// only mounts when the Blog tab is active, so its chunk stays out of
// the profile-page bundle until the operator actually opens it.
const BlogPanel = dynamic(
  () => import("./panels/BlogPanel").then((m) => m.BlogPanel),
  {
    ssr: false,
    loading: () => <Skeleton className="h-40" />,
  }
);

/**
 * Local TabKey supersets MemberTabCount["key"] with frontend-only
 * tabs that aren't yet part of the §9 Phase-4 tab metadata contract
 * (e.g. "photos" — placeholder slot for the upcoming media gallery,
 * shown as ComingSoonPanel until the server ships counts for it).
 *
 * Caveat: when a server `tabs` prop is passed it REPLACES the default
 * list wholesale — FE-only tabs (photos/backing/setup/profile/blog)
 * do not render in that mode. No caller passes `tabs` today
 * (/u/[handle] uses DEFAULT_TABS + the receivedCount/writtenCount
 * badge props); if Phase-4 metadata ever ships, append the FE-only
 * tabs first. Count semantics are reconciled as of v1.49: the
 * contract's `reviews` tab counts RECEIVED and `written` counts
 * authored, matching the badge props.
 */
type TabKey = MemberTabCount["key"] | "photos" | "backing" | "setup" | "profile" | "blog" | "written";

const TAB_KEYS: ReadonlyArray<TabKey> = [
  "activity",
  "reviews",
  "written",
  "watching",
  "disputes",
  "network",
  "groups",
  "photos",
  "backing",
  "setup",
  "profile",
  "blog",
];

function isTabKey(value: string | null | undefined): value is TabKey {
  return value !== null && value !== undefined && (TAB_KEYS as ReadonlyArray<string>).includes(value);
}

/**
 * Default tab list — used when no Phase-4 `tabs` metadata is passed.
 * Order matches the Phase-4 contract so the layout stays stable
 * whether or not counts are available.
 */
const DEFAULT_TABS: ReadonlyArray<{ key: TabKey; label: string; soon?: boolean; ownerOnly?: boolean }> = [
  // "My Profile" tab — identity-bound metadata (wallets, future:
  // verifications etc). Sits first per the 2026-05-14 reorganization
  // request. NOT the default active tab — visitors still land on
  // Backing for the trust evaluation, owners on Activity.
  { key: "profile",  label: "My Profile" },
  // §J.6 — backing is the trust headline. Visitor's default active
  // tab so the "can I trust this operator?" question is the first
  // one answered by the panel content (even though Profile is the
  // first tab in the strip).
  { key: "backing",  label: "Backing" },
  // v1.48 split: "Reviews" = reviews RECEIVED (filed on this member's
  // self-page — public trust signal, mirrors entity cards); "Written"
  // = reviews this member authored. The pre-v1.48 single tab showed
  // authored under a "Reviews on file" header — misleading once
  // member-target reviews existed.
  { key: "reviews",  label: "Reviews" },
  { key: "written",  label: "Written" },
  { key: "activity", label: "Activity" },
  // §3.1 — bidirectional follow graph (followers + following).
  // Renamed from "Watching" because "Watching" leaned outgoing-only
  // and undersold the "Being Watched" sub-tab. "Roster" reads as
  // direction-neutral: a list of people in your orbit.
  { key: "watching", label: "Roster" },
  { key: "photos",   label: "Photos" },
  { key: "disputes", label: "Disputes" },
  { key: "groups",   label: "Groups" },
  // Blog — long-form output as an inline tab. The previous standalone
  // /u/{handle}/blog route was retired on 2026-05-14 in favor of this
  // panel so navigation stays in-place. The panel itself holds two
  // sub-tabs (VIEW · CREATE).
  { key: "blog",     label: "Blog" },
  // Owner-only operator-file hub — Standing + Reliability sub-tabs.
  // The checklist (bio / wallet / local) was folded into Standing →
  // VERIFIED IDENTITY rows on 2026-05-14, so this tab stays relevant
  // throughout the operator's lifetime, not just cold-start.
  { key: "setup",    label: "Setup", ownerOnly: true },
  // Network tab hidden in V1 per the 2026-05-13 UX review — stub
  // ComingSoonPanel trains operators that tabs lie. Reinstate when
  // the §C2 watchers + vouch-graph data ships (Phase 5).
];

interface TabRow {
  key: TabKey;
  label: string;
  /** Phase-4 only. When undefined, the count badge is hidden. */
  count?: number;
  /** Phase-4 only. When true, the PRIVATE chip renders + the panel
   *  short-circuits to ComingSoonPanel without a network call. */
  hidden?: boolean;
  /** Frontend-only flag for tabs whose data hasn't shipped yet
   *  (Phase 6 stubs). Surfaces a quiet "(soon)" suffix so operators
   *  don't waste a click discovering the panel is a ComingSoonPanel. */
  soon?: boolean;
}

export interface ProfileTabsProps {
  /** Handle of the member whose tabs we're showing. Drives lazy-fetch. */
  handle: string;
  /** Display name — used in the blog link aria-label and hidden-tab copy. */
  displayName: string;
  /**
   * Viewer is looking at their own profile. Today this is the gate
   * for mounting the Composer on the Activity tab; future per-tab
   * owner-only affordances (edit-pinned, draft drafts) hang off here.
   */
  isOwner?: boolean;
  /**
   * Optional Phase-4 tab metadata. When provided, per-tab counts +
   * hidden chips render. When omitted, the default 5-tab list is used
   * and each panel's own hidden-state handles privacy via API.
   */
  tabs?: MemberTabCount[];
  /**
   * Target user_id for the BackingPanel's attestation roster fetch.
   * Required because §J.6 attestations key on user_profile target_id,
   * not handle.
   */
  targetUserId: number;
  /**
   * Reputation score — drives the BackingPanel empty-state copy
   * branch (high-rep operators get the aspirational frame instead of
   * the cold-start phrasing).
   */
  reputationScore: number;
  /**
   * Own-profile-only LIVE SHIFT data — passed through to the Activity
   * panel so the LivingHeader renders at the top for the owner.
   * Server only ships these when is_self=true; undefined for visitors.
   */
  living?: MemberLiving | undefined;
  progression?: MemberProgression | undefined;
  /**
   * Full MemberProfile — forwarded into the "My Profile" tab's
   * About / Account sub-tabs so they can render identity fields
   * (display_name, handle, bio) and the wallet list verbatim. The
   * §3.1 contract handles privacy filtering at egress; the panel
   * just renders whatever arrived.
   */
  profile: MemberProfile;
  /**
   * Self-mirror payload for the owner. PR-11b: drives the Setup tab
   * RELIABILITY sub-tab. Fetched server-side in /u/[handle]/page.tsx
   * via getMeReliability when isOwner, undefined otherwise. The
   * sub-tab falls back to a soft "unavailable" state when missing.
   */
  reliability?: MeReliabilityResponse | undefined;
  /**
   * Viewer signed-in flag — drives the Blog panel CREATE sub-tab
   * gating (anonymous vs signed-in-but-not-owner vs owner).
   */
  isSignedIn?: boolean;
  /**
   * Signed-in viewer's handle — Blog panel uses it for the "open your
   * own blog" link when the viewer is signed in but not the owner.
   */
  viewerHandle?: string | null;
  /**
   * v1.49 count badges for the default-tabs path (the server `tabs`
   * prop is still unused — see the TabKey caveat above). Fed from
   * `profile.counts.reviews_received` / `reviews_written`; undefined
   * hides the badge (pre-v1.49 payloads).
   */
  receivedCount?: number | undefined;
  writtenCount?: number | undefined;
}

export function ProfileTabs({
  handle,
  displayName,
  isOwner = false,
  tabs,
  targetUserId,
  reputationScore,
  living,
  progression,
  profile,
  reliability,
  isSignedIn = false,
  viewerHandle = null,
  receivedCount,
  writtenCount,
}: ProfileTabsProps) {
  // `?tab=<key>` drives the panel — external deep links (Floor composer
  // escalation, "Open your blog →", and the retired /settings/* redirects)
  // land on the right panel, and every click writes the key back so the
  // URL always reflects what's on screen.
  const searchParams = useSearchParams();
  const urlTab = searchParams?.get("tab") ?? null;

  // Own-profile defaults to "activity" — the owner cares about "what
  // am I doing on the floor" more than "what did people say about me."
  // Visitors land on "backing" — the §J.6 trust headline that
  // structures their "can I trust this operator?" evaluation.
  const fallbackTab: TabKey = isOwner ? "activity" : "backing";
  const initialTab: TabKey = isTabKey(urlTab) ? urlTab : fallbackTab;
  const [active, setActive] = useState<TabKey>(initialTab);

  // Tab we just wrote to the URL. Until the History update propagates
  // back through useSearchParams we ignore the (still stale) URL, so a
  // click can never be reverted by its own echo — and if propagation
  // never lands, we degrade to "URL follows clicks" rather than fighting.
  const pendingTab = useRef<TabKey | null>(null);

  // Follow the URL when it genuinely changes underneath us (an in-page
  // link to ?tab=…, or a deep link arriving while already mounted).
  useEffect(() => {
    if (!isTabKey(urlTab)) return;
    if (pendingTab.current !== null) {
      if (urlTab === pendingTab.current) pendingTab.current = null;
      return;
    }
    if (urlTab !== active) setActive(urlTab);
  }, [urlTab, active]);

  const handleTabChange = useCallback((key: TabKey) => {
    setActive(key);
    if (typeof window === "undefined") return;
    pendingTab.current = key;
    const params = new URLSearchParams(window.location.search);
    params.set("tab", key);
    window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
  }, []);

  // PR-11b — Setup tab no longer auto-hides on a finished checklist.
  // The tab now holds three sub-tabs (Checklist / Standing /
  // Reliability) so it stays relevant for the operator's own
  // navigation even after the cold-start items are done.
  // Filter tabs by ownership only.
  const filteredDefaults = DEFAULT_TABS.filter((t) => {
    if (t.ownerOnly === true && !isOwner) return false;
    return true;
  });

  // v1.49 — count badges on the review tabs (default-tabs path only;
  // a server `tabs` prop carries its own counts).
  const tabsToRender: TabRow[] = tabs ?? filteredDefaults.map((t) => {
    if (t.key === "reviews" && receivedCount !== undefined) {
      return { ...t, count: receivedCount };
    }
    if (t.key === "written" && writtenCount !== undefined) {
      return { ...t, count: writtenCount };
    }
    return { ...t };
  });
  const activeTab = tabsToRender.find((t) => t.key === active);
  const activeHidden = activeTab?.hidden === true;

  return (
    <section className="bcc-stage-reveal" style={{ ["--stagger" as string]: "560ms" }}>
      {/* Tab strip on the concrete background. Blog is a sibling link
          (separate route per §D6) — sits at the right end so it reads
          as "and there's also a blog over here."
          On phones (< sm) we drop wrap + add horizontal scroll so the
          6 + Blog tabs don't shrink below readable width — swiping the
          row beats stacking them on top of each other. */}
      <div
        role="tablist"
        aria-label="Member sections"
        className="-mx-4 flex items-center gap-x-1 overflow-x-auto border-b border-cardstock/15 px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {tabsToRender.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`tabpanel-${tab.key}`}
            onClick={() => handleTabChange(tab.key)}
            className="bcc-tab shrink-0"
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="bcc-tab-count">{tab.count}</span>
            )}
            {tab.hidden === true && (
              <span
                className="ml-2 inline-block border border-cardstock/30 px-1 text-[9px] tracking-[0.18em]"
                aria-label="Private"
              >
                PRIVATE
              </span>
            )}
            {tab.soon === true && (
              <span
                className="bcc-mono ml-2 text-cardstock-deep/60"
                style={{ fontSize: "9px", letterSpacing: "0.18em" }}
                aria-label="Coming soon"
              >
                (SOON)
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Active-tab → panel relationship — the dashed rule integrates
          with the tab strip's bottom border (the strip itself draws the
          dashed border via .bcc-tab's transparent border-bottom; the
          active tab paints its solid safety-orange segment over that
          stretch). No extra rule needed; the active underline IS the
          break in the dashed line.

          Add aria-labelledby + aria-live so screen readers announce
          panel changes when the tab flips. */}
      <div
        role="tabpanel"
        id={`tabpanel-${active}`}
        aria-labelledby={`tab-${active}`}
        aria-live="polite"
        className="mt-6"
      >
        {activeHidden && activeTab !== undefined ? (
          <ComingSoonPanel
            label={activeTab.label}
            hint={`${displayName} has hidden their ${activeTab.label.toLowerCase()}.`}
          />
        ) : (
          <>
            {active === "profile"  && (
              <ProfilePanel profile={profile} isOwner={isOwner} />
            )}
            {active === "backing"  && (
              <BackingPanel
                handle={handle}
                targetUserId={targetUserId}
                reputationScore={reputationScore}
              />
            )}
            {active === "reviews"  && (
              <CardReviewsPanel
                kind="user_profile"
                cardId={targetUserId}
                cardName={displayName}
              />
            )}
            {active === "written"  && <ReviewsPanel handle={handle} />}
            {active === "disputes" && <DisputesPanel handle={handle} />}
            {active === "watching" && (
              <WatchingPanel handle={handle} displayName={displayName} />
            )}
            {active === "activity" && (
              <ActivityPanel
                handle={handle}
                isOwner={isOwner}
                {...(living !== undefined ? { living } : {})}
                {...(progression !== undefined ? { progression } : {})}
              />
            )}
            {active === "photos"   && <PhotosPanel handle={handle} isOwner={isOwner} />}
            {active === "groups"   && <GroupsPanel handle={handle} />}
            {active === "blog" && (
              <BlogPanel
                handle={handle}
                isOwner={isOwner}
                isSignedIn={isSignedIn}
                viewerHandle={viewerHandle}
              />
            )}
            {active === "network"  && <ComingSoonPanel label="Network" hint="Members you're watching + vouch graph — Phase 5." />}
            {active === "setup" && (
              <SetupPanel
                profile={profile}
                reliability={reliability}
              />
            )}
          </>
        )}
      </div>
    </section>
  );
}
