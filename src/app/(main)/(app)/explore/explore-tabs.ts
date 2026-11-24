import type { SectionTab } from "@/components/ui/SectionTabs";

/**
 * Explore's section header (Site Structure A §10): the menu word as the
 * title, the same on all three tabs. "Creators" is a decided label but
 * kept swappable: change it here and in the header search's scope list
 * (GlobalSearch SCOPE_OPTIONS).
 */
export const EXPLORE_SECTION = {
  eyebrow: "EXPLORE · PAGES",
  title: "Explore",
  lede: "Validators, projects and creators: the pages members vouch for and review.",
} as const;

/**
 * Explore's tabs: one per page kind, each its own route (Site Structure A).
 * Validators is the section's front door, so it owns the bare /explore.
 * No counts yet: /cards sends no `total` (a backend row).
 */
export const EXPLORE_TABS: readonly SectionTab[] = [
  { label: "Validators", href: "/explore" },
  { label: "Projects", href: "/explore/projects" },
  { label: "Creators", href: "/explore/creators" },
];
