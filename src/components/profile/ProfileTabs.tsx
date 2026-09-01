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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

import { Skeleton } from "@/components/ui/Skeleton";
import type { RosterSeed } from "@/hooks/useAttestationRoster";
import { useRovingTabs } from "@/hooks/useRovingTabs";
import { ATTESTATION_COPY, REVIEW_TAB_COPY } from "@/lib/copy/trust-layer";
import {
  SubTabNav,
  subTabId,
  subTabPanelId,
  type SubTabDef,
} from "@/components/profile/SubTabNav";
import type { MeReliabilityResponse, MemberLiving, MemberProfile, MemberProgression, MemberTabCount } from "@/lib/api/types";

import { CardReviewsPanel } from "@/components/entity/panels/CardReviewsPanel";

import { ActivityPanel } from "./panels/ActivityPanel";
import { BackingPanel } from "./panels/BackingPanel";
import { ComingSoonPanel } from "./panels/ComingSoonPanel";
import { DisputesPanel } from "./panels/DisputesPanel";
import { GroupsPanel } from "./panels/GroupsPanel";
import { PhotosPanel } from "./panels/PhotosPanel";
import { ProfileEditPanel } from "./panels/ProfileEditPanel";
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

// Owner-only editor panels (absorbed from /settings/*). Code-split per
// tab so a public visitor to /u/alice never downloads any of this form
// code, and an owner opening "Blocks" doesn't pull in the NFT picker.
//
// The options object is repeated at each call site on purpose: Next's
// SWC transform requires `next/dynamic` options to be an inline object
// literal, and rejects a shared constant
// (https://nextjs.org/docs/messages/invalid-dynamic-options-type).
const PrivacySettingsPanel = dynamic(
  () => import("./panels/settings/PrivacySettingsPanel").then((m) => m.PrivacySettingsPanel),
  { ssr: false, loading: () => <Skeleton className="h-40" /> }
);
const NotificationsSettingsPanel = dynamic(
  () => import("./panels/settings/NotificationsSettingsPanel").then((m) => m.NotificationsSettingsPanel),
  { ssr: false, loading: () => <Skeleton className="h-40" /> }
);
const MessagesSettingsPanel = dynamic(
  () => import("./panels/settings/MessagesSettingsPanel").then((m) => m.MessagesSettingsPanel),
  { ssr: false, loading: () => <Skeleton className="h-40" /> }
);
const CommunitiesSettingsPanel = dynamic(
  () => import("./panels/settings/CommunitiesSettingsPanel").then((m) => m.CommunitiesSettingsPanel),
  { ssr: false, loading: () => <Skeleton className="h-40" /> }
);
const ShowcaseSettingsPanel = dynamic(
  () => import("./panels/settings/ShowcaseSettingsPanel").then((m) => m.ShowcaseSettingsPanel),
  { ssr: false, loading: () => <Skeleton className="h-40" /> }
);
const BlocksSettingsPanel = dynamic(
  () => import("./panels/settings/BlocksSettingsPanel").then((m) => m.BlocksSettingsPanel),
  { ssr: false, loading: () => <Skeleton className="h-40" /> }
);
const AccountSettingsPanel = dynamic(
  () => import("./panels/settings/AccountSettingsPanel").then((m) => m.AccountSettingsPanel),
  { ssr: false, loading: () => <Skeleton className="h-40" /> }
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
type TabKey =
  | MemberTabCount["key"]
  | "photos"
  | "backing"
  | "setup"
  | "profile"
  | "blog"
  | "written"
  // Owner-only editor tabs, absorbed from the retired /settings/* routes.
  | "account"
  | "privacy"
  | "notifications"
  | "messages"
  | "communities"
  | "showcase"
  | "blocks";

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
  "account",
  "privacy",
  "notifications",
  "messages",
  "communities",
  "showcase",
  "blocks",
];

function isTabKey(value: string | null | undefined): value is TabKey {
  return value !== null && value !== undefined && (TAB_KEYS as ReadonlyArray<string>).includes(value);
}

/**
 * The eight owner-only settings sections, grouped under the "My Profile"
 * parent tab.
 *
 * Before this, an owner saw EIGHTEEN tabs in one horizontally-scrolling
 * strip with these scattered through it — "My Profile" at position 1 and
 * the rest at 11-18, interleaved with the public content tabs. Grouping
 * takes the owner's strip to eleven and makes it read as "what visitors
 * see, plus my own stuff."
 *
 * `profile` is both the parent key and its first child. That is deliberate:
 * it keeps `?tab=profile` meaning exactly what it always meant, and it is
 * why the parent needs no key of its own.
 *
 * URL contract: the query keeps carrying the LEAF key. `?tab=account` stays
 * `?tab=account` — no second query parameter is introduced. Eight permanent
 * 308 redirects in next.config.ts and the Settings quick-link in
 * nav-items.tsx point at these, and all of them keep working untouched.
 */
const MY_PROFILE_CHILDREN: ReadonlyArray<SubTabDef<TabKey>> = [
  { key: "profile",       label: "Profile" },
  { key: "privacy",       label: "Privacy" },
  { key: "notifications", label: "Notifications" },
  { key: "messages",      label: "Messages" },
  { key: "communities",   label: "Communities" },
  { key: "showcase",      label: "Showcase" },
  { key: "account",       label: "Account" },
  { key: "blocks",        label: "Blocks" },
];

/** Parent tab that owns "My Profile". */
const MY_PROFILE_PARENT: TabKey = "profile";

/** Id namespace for the settings sub-strip and its panel. One per page. */
const SETTINGS_ID_BASE = "profile-settings";

/**
 * Child key → parent key. Only the seven non-`profile` children need an
 * entry; `profile` IS the parent, so it resolves to itself by fallback.
 */
const PARENT_OF: Partial<Record<TabKey, TabKey>> = Object.fromEntries(
  MY_PROFILE_CHILDREN
    .filter((child) => child.key !== MY_PROFILE_PARENT)
    .map((child) => [child.key, MY_PROFILE_PARENT]),
);

/** The parent a given leaf renders under. Non-grouped tabs own themselves. */
function parentOf(key: TabKey): TabKey {
  return PARENT_OF[key] ?? key;
}

/**
 * Default tab list — used when no Phase-4 `tabs` metadata is passed.
 * Order matches the Phase-4 contract so the layout stays stable
 * whether or not counts are available.
 *
 * This is the PARENT strip: the seven grouped children are not listed here,
 * they live in MY_PROFILE_CHILDREN above.
 */
const DEFAULT_TABS: ReadonlyArray<{ key: TabKey; label: string; soon?: boolean; ownerOnly?: boolean }> = [
  // "My Profile" — the owner's profile EDITOR (avatar/cover, handle,
  // profile fields + per-field visibility). Owner-only: the tab is
  // literally "My Profile", and its predecessor wrongly showed personal
  // Preference/Notifications/Account sub-tabs to visitors. Sits first
  // per the 2026-05-14 reorganization request. NOT the default active
  // tab — owners still land on Activity, visitors on Backing.
  { key: "profile",  label: "My Profile", ownerOnly: true },
  // Owner-only operator-file hub — Standing + Reliability sub-tabs. Renamed
  // from "Setup", which read as onboarding/configuration while the tab
  // actually holds the operator's standing record and deliberately outlived
  // cold-start. Key stays `setup`, so ?tab=setup keeps resolving.
  // Promoted to second so both owner-only tabs sit together at the head of
  // the strip, ahead of the public content a visitor came for.
  { key: "setup",    label: "My Standing", ownerOnly: true },
  // §J.6 — backing is the trust headline. Visitor's default active
  // tab so the "can I trust this operator?" question is the first
  // one answered by the panel content (even though Profile is the
  // first tab in the strip).
  // Label is the genus term over vouches AND backings (§J.6, contract
  // v1.56) — deliberately NOT named after either primitive. The `key`
  // stays `backing` so ?tab=backing deep links keep working.
  { key: "backing",  label: ATTESTATION_COPY.supporters_tab },
  // v1.48 split: "Reviews" = reviews RECEIVED (filed on this member's
  // self-page — public trust signal, mirrors entity cards); "Written"
  // = reviews this member authored. The pre-v1.48 single tab showed
  // authored under a "Reviews on file" header — misleading once
  // member-target reviews existed.
  // Both labels name the noun. "Reviews" / "Written" made the reader infer
  // that "Written" meant reviews — and the panels already say it in full
  // (ReviewsPanel's own header renders "Reviews written", and the counts
  // strip on this page says REVIEWS WRITTEN). Three surfaces, one wording.
  // Keys unchanged, so ?tab=reviews and ?tab=written keep working.
  { key: "reviews",  label: REVIEW_TAB_COPY.received },
  { key: "written",  label: REVIEW_TAB_COPY.written },
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
  // Network tab hidden in V1 per the 2026-05-13 UX review — stub
  // ComingSoonPanel trains operators that tabs lie. Reinstate when
  // the §C2 watchers + vouch-graph data ships (Phase 5).
  //
  // The owner-only editors absorbed from the retired /settings/* routes are
  // NOT listed here any more — they are children of "My Profile" above.
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
   * Anonymous server-rendered first page of the Supporters roster, seeded
   * into React Query so a crawler gets real content instead of an empty
   * skeleton. Undefined for authed viewers and whenever the server read
   * failed — the panel then fetches client-side exactly as before.
   */
  rosterSeed?: RosterSeed | undefined;
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
  /**
   * Signed-in operator's email, forwarded from the server session by the
   * profile page. Only the owner-only Account tab uses it: AccountSection
   * needs the current address for the change-email form, and the retired
   * /settings/account page read it via getServerSession — which a client
   * tab panel can't do. Empty for visitors (that tab doesn't render for
   * them anyway).
   */
  viewerEmail?: string;
}

export function ProfileTabs({
  handle,
  displayName,
  isOwner = false,
  tabs,
  targetUserId,
  reputationScore,
  rosterSeed,
  living,
  progression,
  profile,
  reliability,
  isSignedIn = false,
  viewerHandle = null,
  receivedCount,
  writtenCount,
  viewerEmail = "",
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

  // The seven grouped children are no longer buttons in the parent strip, so
  // membership can't be decided by the strip alone any more — without this a
  // perfectly valid `?tab=account` would fall through to the default tab and
  // silently break eight shipped redirects.
  //
  // Gating the set on `isOwner` is what preserves the original security
  // property: for a signed-in NON-owner the set is empty, so `?tab=account`
  // still falls back rather than mounting the owner's editor under someone
  // else's profile. (No server data leak either way — every editor talks to
  // session-scoped /me/* endpoints — but a visitor would otherwise see THEIR
  // OWN fields loaded under a stranger's handle.)
  const ownerChildKeys: ReadonlySet<TabKey> = useMemo(
    () =>
      isOwner
        ? new Set(MY_PROFILE_CHILDREN.map((child) => child.key))
        : new Set<TabKey>(),
    [isOwner],
  );

  const effectiveActive: TabKey =
    tabsToRender.some((t) => t.key === active) || ownerChildKeys.has(active)
      ? active
      : fallbackTab;

  // Which PARENT tab lights up. A child leaf (`account`) selects its parent
  // (`profile`) in the top strip while the sub-strip selects the leaf.
  const activeParent: TabKey = parentOf(effectiveActive);
  const showSettingsSubTabs = isOwner && activeParent === MY_PROFILE_PARENT;

  const activeTab = tabsToRender.find((t) => t.key === effectiveActive);
  const activeHidden = activeTab?.hidden === true;

  // Manual activation on the parent strip too — same reasoning as the sub
  // strip: these panels are lazy and network-backed, and arrowing must not
  // rewrite the `?tab=` query on every keypress.
  const parentKeys = useMemo(
    () => tabsToRender.map((t) => t.key),
    [tabsToRender],
  );
  const { setRef: setParentRef, onKeyDown: onParentKeyDown } = useRovingTabs(
    parentKeys,
    handleTabChange,
  );

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
        className="-mx-4 flex items-center gap-x-1 overflow-x-auto border-b border-bcc-border px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {tabsToRender.map((tab, index) => (
          <button
            key={tab.key}
            ref={setParentRef(tab.key)}
            type="button"
            role="tab"
            id={`tab-${tab.key}`}
            // Selection follows the PARENT, so "My Profile" stays lit while
            // any of its eight children is the active leaf.
            aria-selected={activeParent === tab.key}
            // Only the selected tab's panel is in the DOM — pointing
            // aria-controls at an unrendered id would be invalid, and
            // mounting every owner editor to satisfy it would defeat the
            // ssr:false code-splitting and the privacy boundary.
            {...(activeParent === tab.key
              ? { "aria-controls": `tabpanel-${tab.key}` }
              : {})}
            tabIndex={activeParent === tab.key ? 0 : -1}
            onClick={() => handleTabChange(tab.key)}
            onKeyDown={(e) => onParentKeyDown(e, index)}
            className="bcc-tab shrink-0"
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="bcc-tab-count">{tab.count}</span>
            )}
            {tab.hidden === true && (
              <span
                className="ml-2 inline-block border border-bcc-border px-1 text-[9px] tracking-[0.18em]"
                aria-label="Private"
              >
                PRIVATE
              </span>
            )}
            {tab.soon === true && (
              <span
                className="bcc-mono ml-2 text-bcc-text-secondary"
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
        id={`tabpanel-${activeParent}`}
        aria-labelledby={`tab-${activeParent}`}
        aria-live="polite"
        className="mt-6"
      >
        {/* My Profile's panel CONTAINS a nested tablist — the eight settings
            sections. Nesting a tabpanel inside a tabpanel is valid, and it
            keeps the URL on the leaf key (?tab=account) with no second query
            parameter. */}
        {showSettingsSubTabs && (
          <SubTabNav
            tabs={MY_PROFILE_CHILDREN}
            active={effectiveActive}
            onSelect={handleTabChange}
            ariaLabel="My Profile sections"
            idBase={SETTINGS_ID_BASE}
          />
        )}
        <div
          {...(showSettingsSubTabs
            ? {
                role: "tabpanel",
                id: subTabPanelId(SETTINGS_ID_BASE, effectiveActive),
                "aria-labelledby": subTabId(SETTINGS_ID_BASE, effectiveActive),
                className: "mt-6",
              }
            : {})}
        >
        {activeHidden && activeTab !== undefined ? (
          <ComingSoonPanel
            label={activeTab.label}
            hint={`${displayName} has hidden their ${activeTab.label.toLowerCase()}.`}
          />
        ) : (
          <>
            {effectiveActive === "profile"  && (
              <ProfileEditPanel profile={profile} />
            )}
            {effectiveActive === "backing"  && (
              <BackingPanel
                handle={handle}
                targetUserId={targetUserId}
                reputationScore={reputationScore}
                rosterSeed={rosterSeed}
              />
            )}
            {effectiveActive === "reviews"  && (
              <CardReviewsPanel
                kind="user_profile"
                cardId={targetUserId}
                cardName={displayName}
              />
            )}
            {effectiveActive === "written"  && <ReviewsPanel handle={handle} />}
            {effectiveActive === "disputes" && <DisputesPanel handle={handle} />}
            {effectiveActive === "watching" && (
              <WatchingPanel handle={handle} displayName={displayName} />
            )}
            {effectiveActive === "activity" && (
              <ActivityPanel
                handle={handle}
                isOwner={isOwner}
                {...(living !== undefined ? { living } : {})}
                {...(progression !== undefined ? { progression } : {})}
              />
            )}
            {effectiveActive === "photos"   && <PhotosPanel handle={handle} isOwner={isOwner} />}
            {effectiveActive === "groups"   && <GroupsPanel handle={handle} />}
            {effectiveActive === "blog" && (
              <BlogPanel
                handle={handle}
                isOwner={isOwner}
                isSignedIn={isSignedIn}
                viewerHandle={viewerHandle}
              />
            )}
            {effectiveActive === "network"  && <ComingSoonPanel label="Network" hint="Members you're watching + vouch graph — Phase 5." />}
            {effectiveActive === "setup" && (
              <SetupPanel
                profile={profile}
                reliability={reliability}
              />
            )}

            {/* Owner-only editors absorbed from /settings/*. Reachable
                only when effectiveActive resolved to them, which the
                ownerOnly filter above already restricts to the owner. */}
            {effectiveActive === "privacy"       && <PrivacySettingsPanel />}
            {effectiveActive === "notifications" && <NotificationsSettingsPanel />}
            {effectiveActive === "messages"      && <MessagesSettingsPanel />}
            {effectiveActive === "communities"   && <CommunitiesSettingsPanel />}
            {effectiveActive === "showcase"      && <ShowcaseSettingsPanel />}
            {effectiveActive === "blocks"        && <BlocksSettingsPanel />}
            {effectiveActive === "account"       && (
              <AccountSettingsPanel currentEmail={viewerEmail} />
            )}
          </>
        )}
        </div>
      </div>
    </section>
  );
}
