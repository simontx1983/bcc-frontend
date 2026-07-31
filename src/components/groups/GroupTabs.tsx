"use client";

/**
 * GroupTabs — bottom-of-group-detail tab strip.
 *
 * Sibling to ProfileTabs / EntityTabs — same dashed border + safety-
 * orange active underline (`.bcc-tab` CSS oracle) so /u, /v, /communities
 * and /groups read as one product.
 *
 * Tabs, in display order:
 *   Stream          — group feed (GroupFeedSection)
 *   About           — group identity + meta (GroupAboutPanel)
 *   Members         — group roster (GroupMembersStrip)
 *   NFT Collections — Halls only, optional
 *   Validators      — Halls only, optional
 *
 * The last two are OPTIONAL and render only when their panel is passed.
 * That keeps /groups and /communities on three tabs (they have no chain
 * behind them) while a Hall gets five — and a Hall on a chain with
 * nothing indexed correctly falls back to three rather than offering two
 * empty rooms. Tab order is fixed here, not per-caller.
 *
 * URL-aware mode (community sub-routes):
 *   Pass `urlBase="/communities/{slug}"` and `urlSyncOn=true`. Clicking a
 *   tab pushes the canonical sub-URL (`/communities/{slug}/about`, etc.)
 *   so SEO + deeplinks stay intact. Each community sub-route mounts the
 *   same shell with the right `initialTab`.
 *
 * Internal-state mode (/groups/[slug], /halls/[slug]):
 *   Omit `urlBase` (or pass `urlSyncOn={false}`). Tab clicks update
 *   internal state only — no route navigation.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { Route } from "next";

export type GroupTabKey =
  | "stream"
  | "about"
  | "members"
  | "collections"
  | "validators";

const TABS: ReadonlyArray<{ key: GroupTabKey; label: string; segment: string }> = [
  { key: "stream",      label: "Stream",          segment: ""            },
  { key: "about",       label: "About",           segment: "about"       },
  { key: "members",     label: "Members",         segment: "members"     },
  { key: "collections", label: "NFT Collections", segment: "collections" },
  { key: "validators",  label: "Validators",      segment: "validators"  },
];

export interface GroupTabsProps {
  /** Active tab at mount. URL-aware route shells pass the segment-
   *  matching value; internal-state callers default to "stream". */
  initialTab?: GroupTabKey;
  /** Stream panel — typically `<GroupFeedSection>`. */
  streamPanel: ReactNode;
  /** Members panel — typically `<GroupMembersStrip>`. */
  membersPanel: ReactNode;
  /** About panel — typically `<GroupAboutPanel>`. */
  aboutPanel: ReactNode;
  /** NFT Collections panel — Halls only. Omit to hide the tab. */
  collectionsPanel?: ReactNode;
  /** Validators panel — Halls only. Omit to hide the tab. */
  validatorsPanel?: ReactNode;
  /**
   * URL prefix for community sub-routes (e.g. `/communities/cosmos-hub`).
   * When set, clicking a tab pushes the canonical sub-URL. Omit on
   * /groups/[slug] + /halls/[slug] for internal-state-only mode.
   */
  urlBase?: string;
}

export function GroupTabs({
  initialTab = "stream",
  streamPanel,
  membersPanel,
  aboutPanel,
  collectionsPanel,
  validatorsPanel,
  urlBase,
}: GroupTabsProps) {
  const router = useRouter();

  const panels: Record<GroupTabKey, ReactNode> = {
    stream:      streamPanel,
    about:       aboutPanel,
    members:     membersPanel,
    collections: collectionsPanel,
    validators:  validatorsPanel,
  };

  // A tab exists only if its panel was supplied — /groups and
  // /communities pass three and stay on three.
  const visibleTabs = TABS.filter((tab) => panels[tab.key] !== undefined);

  // Guard the mount tab: a caller could pass initialTab="validators" for a
  // Hall whose chain has nothing indexed, which would render a tablist
  // with nothing selected.
  const safeInitial = visibleTabs.some((t) => t.key === initialTab)
    ? initialTab
    : (visibleTabs[0]?.key ?? "stream");

  const [active, setActive] = useState<GroupTabKey>(safeInitial);

  const handleSelect = (key: GroupTabKey) => {
    setActive(key);
    if (urlBase !== undefined) {
      const segment = TABS.find((t) => t.key === key)?.segment ?? "";
      const href = segment === "" ? urlBase : `${urlBase}/${segment}`;
      router.push(href as Route);
    }
  };

  return (
    <section className="bcc-stage-reveal" style={{ ["--stagger" as string]: "440ms" }}>
      <div
        role="tablist"
        aria-label="Group sections"
        className="-mx-4 flex items-center gap-x-1 overflow-x-auto border-b border-bcc-border px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {visibleTabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            id={`group-tab-${tab.key}`}
            aria-selected={active === tab.key}
            aria-controls={`group-tabpanel-${tab.key}`}
            onClick={() => handleSelect(tab.key)}
            className="bcc-tab shrink-0"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`group-tabpanel-${active}`}
        aria-labelledby={`group-tab-${active}`}
        aria-live="polite"
        className="mt-6"
      >
        {panels[active]}
      </div>
    </section>
  );
}
