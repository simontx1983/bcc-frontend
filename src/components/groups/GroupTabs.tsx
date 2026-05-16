"use client";

/**
 * GroupTabs — bottom-of-group-detail tab strip.
 *
 * Sibling to ProfileTabs / EntityTabs — same dashed border + safety-
 * orange active underline (`.bcc-tab` CSS oracle) so /u, /v, /communities
 * and /groups read as one product.
 *
 * Three tabs:
 *   Stream  — group feed (GroupFeedSection)
 *   Members — group roster (GroupMembersStrip)
 *   About   — group identity + meta (GroupAboutPanel)
 *
 * URL-aware mode (community sub-routes):
 *   Pass `urlBase="/communities/{slug}"` and `urlSyncOn=true`. Clicking a
 *   tab pushes the canonical sub-URL (`/communities/{slug}/about`, etc.)
 *   so SEO + deeplinks stay intact. Each community sub-route mounts the
 *   same shell with the right `initialTab`.
 *
 * Internal-state mode (/groups/[slug], /locals/[slug]):
 *   Omit `urlBase` (or pass `urlSyncOn={false}`). Tab clicks update
 *   internal state only — no route navigation.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import type { Route } from "next";

export type GroupTabKey = "stream" | "members" | "about";

const TABS: ReadonlyArray<{ key: GroupTabKey; label: string; segment: string }> = [
  { key: "stream",  label: "Stream",  segment: ""        },
  { key: "members", label: "Members", segment: "members" },
  { key: "about",   label: "About",   segment: "about"   },
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
  /**
   * URL prefix for community sub-routes (e.g. `/communities/cosmos-hub`).
   * When set, clicking a tab pushes the canonical sub-URL. Omit on
   * /groups/[slug] + /locals/[slug] for internal-state-only mode.
   */
  urlBase?: string;
}

export function GroupTabs({
  initialTab = "stream",
  streamPanel,
  membersPanel,
  aboutPanel,
  urlBase,
}: GroupTabsProps) {
  const router = useRouter();
  const [active, setActive] = useState<GroupTabKey>(initialTab);

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
        className="-mx-4 flex items-center gap-x-1 overflow-x-auto border-b border-cardstock/15 px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {TABS.map((tab) => (
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
        {active === "stream"  && streamPanel}
        {active === "members" && membersPanel}
        {active === "about"   && aboutPanel}
      </div>
    </section>
  );
}
