"use client";

/**
 * ProfileTabs — the bottom-of-profile tab strip with the active panel.
 *
 * Tabs: Binder · Reviews · Activity · Disputes · Groups · Network.
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
 * URL state is intentionally omitted in V1 — the deep-link contract
 * (?tab=disputes) is a Phase-5 follow-up once we're wiring the
 * settings page and need consistent query-state handling.
 */

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import type { MemberTabCount } from "@/lib/api/types";

import { ReviewsPanel } from "./panels/ReviewsPanel";
import { DisputesPanel } from "./panels/DisputesPanel";
import { ActivityPanel } from "./panels/ActivityPanel";
import { ComingSoonPanel } from "./panels/ComingSoonPanel";
import { GroupsPanel } from "./panels/GroupsPanel";

type TabKey = MemberTabCount["key"];

/**
 * Default tab list — used when no Phase-4 `tabs` metadata is passed.
 * Order matches the Phase-4 contract so the layout stays stable
 * whether or not counts are available.
 */
const DEFAULT_TABS: ReadonlyArray<{ key: TabKey; label: string }> = [
  { key: "binder",   label: "Binder" },
  { key: "reviews",  label: "Reviews" },
  { key: "activity", label: "Activity" },
  { key: "disputes", label: "Disputes" },
  { key: "groups",   label: "Groups" },
  { key: "network",  label: "Network" },
];

interface TabRow {
  key: TabKey;
  label: string;
  /** Phase-4 only. When undefined, the count badge is hidden. */
  count?: number;
  /** Phase-4 only. When true, the PRIVATE chip renders + the panel
   *  short-circuits to ComingSoonPanel without a network call. */
  hidden?: boolean;
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
}

export function ProfileTabs({ handle, displayName, isOwner = false, tabs }: ProfileTabsProps) {
  const [active, setActive] = useState<TabKey>("reviews");

  const tabsToRender: TabRow[] = tabs ?? DEFAULT_TABS.map((t) => ({ ...t }));
  const activeTab = tabsToRender.find((t) => t.key === active);
  const activeHidden = activeTab?.hidden === true;
  const blogHref = `/u/${handle}/blog` as Route;

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
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
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
          </button>
        ))}
        <Link
          href={blogHref}
          className="bcc-tab shrink-0 sm:ml-auto"
          aria-label={`Open ${displayName}'s blog`}
        >
          Blog
          <span className="bcc-tab-count" aria-hidden>→</span>
        </Link>
      </div>

      <div role="tabpanel" className="mt-6">
        {activeHidden && activeTab !== undefined ? (
          <ComingSoonPanel
            label={activeTab.label}
            hint={`${displayName} has hidden their ${activeTab.label.toLowerCase()}.`}
          />
        ) : (
          <>
            {active === "reviews"  && <ReviewsPanel handle={handle} />}
            {active === "disputes" && <DisputesPanel handle={handle} />}
            {active === "binder"   && <ComingSoonPanel label="Binder" hint="3×3 ring-bound grid lands in Phase 6 with the gallery." />}
            {active === "activity" && <ActivityPanel handle={handle} isOwner={isOwner} />}
            {active === "groups"   && <GroupsPanel handle={handle} />}
            {active === "network"  && <ComingSoonPanel label="Network" hint="Members you're watching + vouch graph — Phase 5." />}
          </>
        )}
      </div>
    </section>
  );
}
