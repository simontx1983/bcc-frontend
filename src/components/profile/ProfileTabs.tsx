"use client";

/**
 * ProfileTabs — the bottom-of-profile navigation with the active panel.
 *
 * Five groups for an owner, four for a visitor:
 *
 *   My Profile (owner-only) · Reputation · Network · Activity · Content
 *
 * Each group opens a strip of its own leaves; the leaf is what the URL
 * carries. See PROFILE_GROUPS below for the manifest and the URL contract.
 *
 * Decoupled from Phase4MemberProfile per the V1.5 refactor: the
 * component now takes `handle` + `displayName` directly so a §3.1
 * profile page can mount it without supplying the full speculative
 * super-shape. When `tabs` (Phase-4 metadata) is supplied it decorates the
 * matching LEAVES with count badges and PRIVATE chips; when it's omitted,
 * the review counts come from `receivedCount`/`writtenCount` and the panels'
 * own hidden-state handles privacy.
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
import { TabRail } from "@/components/ui/TabRail";
import type { RosterSeed } from "@/hooks/useAttestationRoster";
import { useRovingTabs } from "@/hooks/useRovingTabs";
import {
  SettingsDirtyProvider,
  useSettingsDirtyGuard,
} from "@/components/settings/SettingsDirtyProvider";
import { ATTESTATION_COPY, REVIEW_TAB_COPY, ROSTER_TAB_COPY } from "@/lib/copy/trust-layer";
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
  // Flattened out of a panel's own sub-tab state by the profile regrouping.
  // Neither had a URL before: they were local `useState` inside SetupPanel and
  // WatchingPanel, so they could not be linked to and a refresh lost them.
  // Their SIBLINGS keep the legacy keys (`setup` = Standing, `watching` =
  // Watchers), which is what makes the two new keys additive rather than a
  // renumbering of the existing contract.
  | "reliability"
  | "following"
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
  "reliability",
  "following",
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
/**
 * The five settings GROUPS, in display order, and the leaves each owns.
 *
 * The flat row of eight this replaces put Account seventh, past the right
 * edge of an ordinary laptop, and mixed three different kinds of setting in
 * one line. Grouping is by what a person came to do, not by how the feature
 * is built:
 *
 *   Profile          public identity — what a stranger sees
 *   Account          credentials and the danger zone; promoted to second
 *   Privacy & Safety who can see you, message you, and who you have blocked
 *   Notifications    how you are told, a different question from who may
 *   Community Access eligibility and unlocking through verified holdings
 *
 * A group with ONE leaf renders no child strip — it is simply a destination.
 * Only Profile and Privacy & Safety open a second row.
 *
 * URL contract, unchanged: the query carries the LEAF key and nothing else.
 * `?tab=account` is still `?tab=account`; no group name ever appears in a
 * URL, so the eight permanent 308 redirects in next.config.ts and every
 * hardcoded `/u/me?tab=…` link keep resolving exactly as before. Group keys
 * below deliberately reuse their default leaf's key so there is no second
 * namespace to keep in sync.
 */
interface SettingsGroup {
  /** Never appears in a URL. Equals the group's default leaf key. */
  key: TabKey;
  label: string;
  /** Leaves in display order. The first is the group's default destination. */
  children: ReadonlyArray<SubTabDef<TabKey>>;
}

const SETTINGS_GROUPS: ReadonlyArray<SettingsGroup> = [
  {
    key: "profile",
    label: "Profile",
    children: [
      // "Details" rather than "Profile" — a Profile > Profile stutter reads
      // as a mistake. The KEY stays `profile`.
      { key: "profile",  label: "Details" },
      { key: "showcase", label: "Showcase" },
    ],
  },
  { key: "account",       label: "Account",          children: [{ key: "account",       label: "Account" }] },
  {
    key: "privacy",
    label: "Privacy & Safety",
    children: [
      { key: "privacy",  label: "Privacy" },
      { key: "messages", label: "Messages" },
      // "Blocked accounts" says what the list holds; "Blocks" did not.
      { key: "blocks",   label: "Blocked accounts" },
    ],
  },
  { key: "notifications", label: "Notifications",    children: [{ key: "notifications", label: "Notifications" }] },
  // The panel manages eligibility for NFT-gated communities, which is a
  // different job from the profile's list of communities you already belong
  // to. Naming them apart stops one word meaning two things.
  { key: "communities",   label: "Community Access", children: [{ key: "communities",   label: "Community Access" }] },
];

/** Every settings leaf, flattened, in display order. */
const MY_PROFILE_CHILDREN: ReadonlyArray<SubTabDef<TabKey>> = SETTINGS_GROUPS.flatMap(
  (g) => g.children,
);

/** The group strip itself, as SubTabNav wants it. */
const SETTINGS_GROUP_TABS: ReadonlyArray<SubTabDef<TabKey>> = SETTINGS_GROUPS.map(
  ({ key, label }) => ({ key, label }),
);

/** Parent tab that owns "My Profile". */
const MY_PROFILE_PARENT: TabKey = "profile";

/** Id namespace for the settings CHILD strip and its panel. One per page. */
const SETTINGS_ID_BASE = "profile-settings";
/** Separate namespace for the GROUP strip, so the two cannot mint equal ids. */
const SETTINGS_GROUP_ID_BASE = "profile-settings-group";

/**
 * Leaf key → its settings group. Built from the one manifest above, so a
 * leaf cannot belong to two groups or to none: adding a leaf to
 * SETTINGS_GROUPS is the only way to make it reachable at all.
 */
const GROUP_OF_LEAF: Partial<Record<TabKey, TabKey>> = Object.fromEntries(
  SETTINGS_GROUPS.flatMap((g) => g.children.map((c) => [c.key, g.key])),
);

/** The settings group a leaf belongs to, or undefined if it is not a leaf. */
function settingsGroupOf(key: TabKey): TabKey | undefined {
  return GROUP_OF_LEAF[key];
}

/** Where activating a group should take you: its first child. */
function defaultLeafOfGroup(groupKey: TabKey): TabKey {
  const group = SETTINGS_GROUPS.find((g) => g.key === groupKey);
  return group?.children[0]?.key ?? groupKey;
}

/** The children to show under a group — empty when the group is a destination. */
function childrenOfGroup(groupKey: TabKey): ReadonlyArray<SubTabDef<TabKey>> {
  const group = SETTINGS_GROUPS.find((g) => g.key === groupKey);
  // One child is a destination, not a choice: rendering a one-item strip
  // would add a row that can never do anything.
  return group !== undefined && group.children.length > 1 ? group.children : [];
}

/**
 * PROFILE_GROUPS — the five top-level destinations on a profile.
 *
 * The strip this replaces held ELEVEN tabs for an owner and nine for a
 * visitor, in one row, ordered by the history of when each shipped rather
 * than by what anyone came to do. Eleven is past the point where a strip can
 * be read at a glance: the operator scans it instead, and on a laptop the
 * right-hand entries sat off-screen entirely — the same failure that hid
 * Account inside settings.
 *
 * Grouping is by the QUESTION being asked, not by which endpoint answers it:
 *
 *   My Profile   my own settings — owner-only, the one group a visitor
 *                never sees, which is why a visitor's strip is four
 *   Reputation   can this operator be trusted, and on what evidence
 *   Network      who they are connected to, in both directions
 *   Activity     what they are doing right now
 *   Content      what they have published
 *
 * Two of these hold sections that were previously LOCKED INSIDE a panel's
 * local state — Reliability inside SetupPanel and Watching inside
 * WatchingPanel. Flattening them into leaves is what pays for the smaller
 * strip: the total number of destinations goes UP (they are addressable and
 * linkable now), while the number of things in the top row goes down.
 *
 * ## URL contract — additive only
 *
 * The query still carries the LEAF key and nothing else. No group name ever
 * appears in a URL, so `?tab=account`, `?tab=blog`, `?tab=backing` and the
 * eleven redirects in next.config.ts resolve exactly as before. Two keys are
 * NEW (`reliability`, `following`); none is renamed, removed or repointed.
 *
 * The two legacy keys that could have been repointed deliberately were not:
 *
 *   `?tab=setup`     → Standing   (SetupPanel's own default sub-tab)
 *   `?tab=watching`  → Watchers   (WatchingPanel's own default sub-tab)
 *
 * so both links land on precisely the content they already landed on.
 *
 * ## Group keys live in their own namespace
 *
 * A group key is NOT a `TabKey`. It never reaches a URL, and giving it a
 * separate type is what makes that structural rather than a convention that
 * has to be remembered: `?tab=reputation` cannot resolve, because
 * `"reputation"` is not a member of TabKey at all.
 *
 * `activity` is the single overlap, and it is not an exception to the rule —
 * that group holds exactly one leaf whose key IS `activity`, so the URL value
 * is the leaf's, not the group's. `PROFILE_GROUP_KEYS_ARE_NOT_LEAVES` in the
 * tests states the invariant precisely.
 *
 * The Network group is keyed `network` internally. That is a group key, so it
 * is unreachable as a URL: `network` is a dormant §9 contract key with no tab,
 * no leaf and no panel, and this change does not make `?tab=network` work.
 */
type ProfileGroupKey =
  | "my-profile"
  | "reputation"
  | "network"
  | "activity"
  | "content";

interface ProfileLeaf extends SubTabDef<TabKey> {
  /** Hidden from visitors, and unreachable by URL for them. */
  ownerOnly?: boolean;
}

interface ProfileGroup {
  /** Own namespace — never a TabKey, so it can never appear in `?tab=`. */
  key: ProfileGroupKey;
  label: string;
  ownerOnly?: boolean;
  /** Leaves in display order; the first VISIBLE one is the destination. */
  children: ReadonlyArray<ProfileLeaf>;
}

const PROFILE_GROUPS: ReadonlyArray<ProfileGroup> = [
  {
    // The owner's own settings. Its children are not leaves of a plain strip —
    // this group opens SETTINGS_GROUPS, which has its own second level. The
    // settings manifest is REUSED, never forked.
    key: "my-profile",
    label: "My Profile",
    ownerOnly: true,
    children: MY_PROFILE_CHILDREN,
  },
  {
    key: "reputation",
    label: "Reputation",
    children: [
      // The owner's own record comes FIRST, and is what an owner lands on when
      // they open Reputation — "how am I doing" is the question they came with.
      // A visitor never sees these two, so their first visible leaf is Reviews
      // Received and the ordering below is unaffected.
      { key: "setup",       label: "Standing",    ownerOnly: true },
      { key: "reliability", label: "Reliability", ownerOnly: true },
      // v1.48 split: `reviews` = reviews RECEIVED (filed on this member),
      // `written` = reviews this member authored. Both labels name the noun,
      // matching the counts strip above and the panels' own headers.
      { key: "reviews",  label: REVIEW_TAB_COPY.received },
      { key: "written",  label: REVIEW_TAB_COPY.written },
      // Disputes is evidence about an operator in the same way a review is, so
      // a reader weighing trust gets them side by side rather than in a
      // category of its own.
      { key: "disputes", label: "Disputes" },
    ],
  },
  {
    key: "network",
    label: "Network",
    children: [
      // Supporters is who stands behind this operator — a relationship, which
      // is what this group is about. §J.6: the label is the genus term over
      // vouches AND backings (contract v1.56), deliberately not named after
      // either primitive. The `backing` key is unchanged.
      { key: "backing",   label: ATTESTATION_COPY.supporters_tab },
      // Direction is load-bearing and was previously buried inside one panel's
      // local state: `watching` → useUserFollowers (people watching this
      // operator), `following` → useUserFollowing (people this operator
      // watches). The key/label crossover is deliberate — `?tab=watching`
      // already opened the Watchers sub-tab, so it still does.
      { key: "watching",  label: ROSTER_TAB_COPY.followers },
      { key: "following", label: ROSTER_TAB_COPY.following },
      // Label only. The `groups` KEY is unchanged, so `?tab=groups` and every
      // existing link keep resolving; "Communities" is what the product calls
      // them everywhere else, and "Groups" beside "Network" read as a second
      // kind of grouping rather than as the halls a member belongs to.
      { key: "groups",    label: "Communities" },
    ],
  },
  // One leaf, so no second row: Activity is a destination, not a choice.
  { key: "activity", label: "Activity", children: [{ key: "activity", label: "Activity" }] },
  {
    key: "content",
    label: "Content",
    children: [
      { key: "blog",   label: "Blog" },
      { key: "photos", label: "Photos" },
    ],
  },
];

/** Id namespace for the profile-group CHILD strip. Distinct from the two
 *  settings namespaces and from the parent strip's `tab-<key>`, so three
 *  strips can be on screen without minting an equal id. */
const PROFILE_LEAF_ID_BASE = "profile-leaf";

/**
 * Leaf key → its profile group. Built from the one manifest, so a leaf cannot
 * belong to two groups or to none: adding it to PROFILE_GROUPS is the only
 * way to make it reachable at all.
 */
const PROFILE_GROUP_OF_LEAF: Partial<Record<TabKey, ProfileGroupKey>> =
  Object.fromEntries(PROFILE_GROUPS.flatMap((g) => g.children.map((c) => [c.key, g.key])));

/**
 * The group a leaf belongs to. Total over valid leaves by construction — the
 * caller only ever passes `effectiveActive`, which `validLeafKeys` has already
 * proved is a leaf — but a group key must still be returned, never a TabKey,
 * so the fallback names the group that owns the viewer's default destination.
 */
function profileGroupOf(leaf: TabKey, isOwner: boolean): ProfileGroupKey {
  return PROFILE_GROUP_OF_LEAF[leaf] ?? (isOwner ? "activity" : "network");
}

/** Groups this viewer may see. Only My Profile is owner-only. */
function visibleGroups(isOwner: boolean): ReadonlyArray<ProfileGroup> {
  return PROFILE_GROUPS.filter((g) => g.ownerOnly !== true || isOwner);
}

/** Leaves of a group this viewer may see. */
function visibleLeaves(
  group: ProfileGroup,
  isOwner: boolean,
): ReadonlyArray<ProfileLeaf> {
  return group.children.filter((c) => c.ownerOnly !== true || isOwner);
}

/**
 * Where activating a group takes you: its first VISIBLE leaf.
 *
 * Filtering by viewer is what makes one ordering serve both. Reputation lists
 * Standing and Reliability first, so an owner opening it lands on Standing;
 * for a visitor those two are not visible at all, so the same rule lands them
 * on Reviews Received. There is no second table of per-viewer defaults to keep
 * in sync, and a visitor can never be sent to a leaf they cannot open.
 */
function defaultLeafOfProfileGroup(
  groupKey: ProfileGroupKey,
  isOwner: boolean,
  fallback: TabKey,
): TabKey {
  const group = PROFILE_GROUPS.find((g) => g.key === groupKey);
  if (group === undefined) return fallback;
  return visibleLeaves(group, isOwner)[0]?.key ?? fallback;
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

  // Everything that can change tabs goes through requestNavigation instead
  // of handleTabChange. handleTabChange stays the RAW move and is called
  // only by the guard — the choke point is what makes this one wrapper
  // enough to cover clicks, Enter and Space on both strips.
  const dirtyGuard = useSettingsDirtyGuard(handleTabChange);
  const { requestNavigation } = dirtyGuard;

  // The five (or four) top-level groups this viewer sees.
  const groups = useMemo(() => visibleGroups(isOwner), [isOwner]);

  /**
   * Per-leaf metadata: the count badge and the §K2 PRIVATE chip.
   *
   * `tabs` used to REPLACE the top-level strip wholesale, which no caller ever
   * did and which could not survive this change: the strip now holds groups,
   * not leaves, so a list of leaves is no longer the same kind of thing. It is
   * now an OVERLAY keyed by leaf, which is what the payload always described
   * (a count and a hidden flag per section) and is where the badges have to
   * land anyway now that the review tabs are children.
   */
  const leafMeta = useMemo(() => {
    const m = new Map<TabKey, { count?: number; hidden?: boolean }>();
    if (receivedCount !== undefined) m.set("reviews", { count: receivedCount });
    if (writtenCount !== undefined) m.set("written", { count: writtenCount });
    for (const t of tabs ?? []) {
      m.set(t.key, { count: t.count, hidden: t.hidden });
    }
    return m;
  }, [tabs, receivedCount, writtenCount]);

  /** A manifest leaf decorated with its metadata, ready for a strip. */
  const decorate = useCallback(
    (leaf: ProfileLeaf): SubTabDef<TabKey> => {
      const meta = leafMeta.get(leaf.key);
      return {
        key: leaf.key,
        label: leaf.label,
        ...(meta?.count !== undefined ? { count: meta.count } : {}),
        ...(meta?.hidden === true ? { hidden: true } : {}),
      };
    },
    [leafMeta],
  );

  /**
   * Every leaf this viewer may open. Membership can't be read off the top
   * strip any more — it holds groups — so without this a perfectly valid
   * `?tab=account` would fall through to the default tab and silently break
   * eleven shipped redirects.
   *
   * Gating on `isOwner` is what preserves the security property: for a
   * signed-in NON-owner the owner-only group and the two owner-only leaves are
   * absent, so `?tab=account` and `?tab=reliability` fall back rather than
   * mounting the owner's own editor under a stranger's handle. (No server data
   * leak either way — every editor talks to session-scoped /me/* endpoints —
   * but a visitor would otherwise see THEIR OWN fields under someone else's
   * profile.)
   */
  const validLeafKeys: ReadonlySet<TabKey> = useMemo(
    () =>
      new Set(
        visibleGroups(isOwner).flatMap((g) =>
          visibleLeaves(g, isOwner).map((c) => c.key),
        ),
      ),
    [isOwner],
  );

  const effectiveActive: TabKey = validLeafKeys.has(active) ? active : fallbackTab;

  // Which top-level tab lights up. A leaf (`account`, `following`) selects its
  // GROUP up top while the sub-strip selects the leaf itself. Derived from the
  // leaf every render — never stored — so Back, Forward, a refresh and a
  // pasted deep link all resolve identically.
  const activeGroupKey: ProfileGroupKey = profileGroupOf(effectiveActive, isOwner);
  const activeGroup = groups.find((g) => g.key === activeGroupKey);
  const isSettingsGroup = isOwner && activeGroupKey === "my-profile";

  /**
   * The group's own child strip. My Profile is excluded because its second
   * level is SETTINGS_GROUPS, not leaves — it gets the two settings strips
   * below instead. A one-leaf group renders no strip: a row that can only
   * select what is already selected is furniture, not navigation.
   */
  const groupLeaves: ReadonlyArray<SubTabDef<TabKey>> = useMemo(() => {
    if (activeGroup === undefined || isSettingsGroup) return [];
    const leaves = visibleLeaves(activeGroup, isOwner);
    return leaves.length > 1 ? leaves.map(decorate) : [];
  }, [activeGroup, isSettingsGroup, isOwner, decorate]);

  // Which settings group the active leaf sits in, and what hangs off it.
  const activeSettingsGroup: TabKey =
    settingsGroupOf(effectiveActive) ?? MY_PROFILE_PARENT;
  const settingsChildren = childrenOfGroup(activeSettingsGroup);
  const activeSettingsGroupLabel =
    SETTINGS_GROUPS.find((g) => g.key === activeSettingsGroup)?.label ?? "Settings";

  const activeLeaf = activeGroup?.children.find((c) => c.key === effectiveActive);
  const activeHidden = leafMeta.get(effectiveActive)?.hidden === true;

  /**
   * Activating a GROUP means going to its default leaf — except when it is
   * already the active group, which must be a true no-op rather than a move.
   *
   * Both halves matter. Navigating would throw away the operator's position
   * inside the group they are already in (clicking Network while reading
   * Communities would jump back to Supporters), and merely REQUESTING the
   * navigation would ask the dirty guard to warn about a move that is not
   * happening — so an unsaved form would raise a dialog for clicking the tab
   * it is already on.
   */
  const activateGroup = useCallback(
    (groupKey: ProfileGroupKey) => {
      if (groupKey === activeGroupKey) return;
      requestNavigation(defaultLeafOfProfileGroup(groupKey, isOwner, fallbackTab));
    },
    [activeGroupKey, isOwner, requestNavigation, fallbackTab],
  );

  /** Same no-op rule one level down, for the settings group strip. */
  const activateSettingsGroup = useCallback(
    (groupKey: TabKey) => {
      if (groupKey === activeSettingsGroup) return;
      requestNavigation(defaultLeafOfGroup(groupKey));
    },
    [activeSettingsGroup, requestNavigation],
  );

  // Manual activation on the top strip too — same reasoning as the sub
  // strips: these panels are lazy and network-backed, and arrowing must not
  // rewrite the `?tab=` query on every keypress.
  const groupKeys = useMemo(() => groups.map((g) => g.key), [groups]);
  const { setRef: setParentRef, onKeyDown: onParentKeyDown } = useRovingTabs(
    groupKeys,
    activateGroup,
  );

  return (
    <section className="bcc-stage-reveal" style={{ ["--stagger" as string]: "560ms" }}>
      {/* The provider only carries the registry down to the settings forms;
          the guard state itself lives in this component because the strips
          above need requestNavigation. */}
      <SettingsDirtyProvider registry={dirtyGuard.registry}>
      {/* The top strip carries GROUPS — five for an owner, four for a
          visitor. No counts and no chips up here: a count on "Reputation"
          would have to aggregate four different quantities into one number
          that answers no question. Counts belong beside the leaf they count,
          which is where they now render.
          Below `sm` the row scrolls rather than shrinking below readable
          width; from `sm` up it wraps so nothing hides past the right edge.
          TabRail scrolls the selected group into view on mount and on every
          selection change — useRovingTabs follows FOCUS, not selection, so a
          deep link would otherwise land with its tab off-screen. */}
      <TabRail activeKey={activeGroupKey}>
      <div
        role="tablist"
        aria-label="Member sections"
        className="-mx-4 flex items-center gap-x-1 overflow-x-auto border-b border-bcc-border px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {groups.map((group, index) => (
          <button
            key={group.key}
            ref={setParentRef(group.key)}
            type="button"
            role="tab"
            id={`tab-${group.key}`}
            // Selection follows the GROUP, so "Network" stays lit while any
            // of its three leaves is the active one.
            aria-selected={activeGroupKey === group.key}
            // Only the selected group's panel is in the DOM — pointing
            // aria-controls at an unrendered id would be invalid, and
            // mounting every panel to satisfy it would defeat the
            // ssr:false code-splitting and the privacy boundary.
            {...(activeGroupKey === group.key
              ? { "aria-controls": `tabpanel-${group.key}` }
              : {})}
            tabIndex={activeGroupKey === group.key ? 0 : -1}
            onClick={() => activateGroup(group.key)}
            onKeyDown={(e) => onParentKeyDown(e, index)}
            className="bcc-tab shrink-0"
          >
            {group.label}
          </button>
        ))}
      </div>
      </TabRail>

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
        id={`tabpanel-${activeGroupKey}`}
        aria-labelledby={`tab-${activeGroupKey}`}
        aria-live="polite"
        className="mt-6"
      >
        {/* A group's panel CONTAINS its own tablist. Nesting a tabpanel inside
            a tabpanel is valid, and it keeps the URL on the leaf key
            (?tab=account) with no second query parameter. */}
        {isSettingsGroup ? (
          <>
            {/* SETTINGS GROUP strip — five destinations. Selecting one
                navigates to its default leaf, so the URL still carries a leaf
                key and the move goes through the same dirty guard as any
                other tab. */}
            <SubTabNav
              tabs={SETTINGS_GROUP_TABS}
              active={activeSettingsGroup}
              onSelect={activateSettingsGroup}
              ariaLabel="My Profile settings"
              idBase={SETTINGS_GROUP_ID_BASE}
              // Only the innermost strip controls the panel. With a child
              // strip present the child owns that relationship, so the group
              // tab claims nothing; as a destination the group tab IS the
              // control and points at the real panel id.
              controlsPanelId={
                settingsChildren.length > 0
                  ? null
                  : subTabPanelId(SETTINGS_ID_BASE, effectiveActive)
              }
            />
            {/* SETTINGS CHILD strip — only for groups that hold a real choice.
                Account, Notifications and Community Access are destinations
                and get no second row. */}
            {settingsChildren.length > 0 && (
              <div className="mt-3">
                <SubTabNav
                  tabs={settingsChildren}
                  active={effectiveActive}
                  onSelect={requestNavigation}
                  ariaLabel={`${activeSettingsGroupLabel} sections`}
                  idBase={SETTINGS_ID_BASE}
                />
              </div>
            )}
          </>
        ) : (
          // LEAF strip for every other group that holds more than one leaf.
          // Activity has exactly one and renders no strip at all.
          groupLeaves.length > 0 && (
            <SubTabNav
              tabs={groupLeaves}
              active={effectiveActive}
              onSelect={requestNavigation}
              ariaLabel={`${activeGroup?.label ?? "Member"} sections`}
              idBase={PROFILE_LEAF_ID_BASE}
            />
          )
        )}
        <div
          {...(isSettingsGroup
            ? {
                role: "tabpanel",
                // The panel is labelled by whichever strip actually holds the
                // active leaf: the child strip when the group has one, the
                // group strip when the group IS the destination.
                id: subTabPanelId(SETTINGS_ID_BASE, effectiveActive),
                "aria-labelledby":
                  settingsChildren.length > 0
                    ? subTabId(SETTINGS_ID_BASE, effectiveActive)
                    : subTabId(SETTINGS_GROUP_ID_BASE, activeSettingsGroup),
                className: "mt-6",
              }
            : groupLeaves.length > 0
              ? {
                  role: "tabpanel",
                  id: subTabPanelId(PROFILE_LEAF_ID_BASE, effectiveActive),
                  "aria-labelledby": subTabId(PROFILE_LEAF_ID_BASE, effectiveActive),
                  className: "mt-6",
                }
              // A one-leaf group has no inner strip, so the OUTER tabpanel
              // above is already the panel. A second tabpanel here would be
              // labelled by nothing.
              : {})}
        >
        {activeHidden && activeLeaf !== undefined ? (
          <ComingSoonPanel
            label={activeLeaf.label}
            hint={`${displayName} has hidden their ${activeLeaf.label.toLowerCase()}.`}
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
            {/* Two leaves, one component, one direction each. `watching` is
                Watchers because that is the sub-tab `?tab=watching` already
                opened; `following` is the direction that had no URL before. */}
            {effectiveActive === "watching" && (
              <WatchingPanel
                handle={handle}
                displayName={displayName}
                direction="followers"
              />
            )}
            {effectiveActive === "following" && (
              <WatchingPanel
                handle={handle}
                displayName={displayName}
                direction="following"
              />
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
            {/* Standing and Reliability were sub-tabs of one panel; each is
                now its own leaf, so each has a URL and survives a refresh.
                (The dormant `network` contract key kept a ComingSoonPanel
                branch here that nothing could ever reach — `network` is in no
                strip and no manifest. Removed rather than left to imply
                `?tab=network` does something next to a "Network" group.) */}
            {effectiveActive === "setup" && (
              <SetupPanel
                profile={profile}
                reliability={reliability}
                section="standing"
              />
            )}
            {effectiveActive === "reliability" && (
              <SetupPanel
                profile={profile}
                reliability={reliability}
                section="reliability"
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

      {/* Inside the provider so <Dialog>’s focus return lands on the tab
          that triggered it. */}
      {dirtyGuard.dialog}
      </SettingsDirtyProvider>
    </section>
  );
}
