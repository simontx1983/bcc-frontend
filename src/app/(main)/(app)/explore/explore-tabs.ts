import type { SectionTab } from "@/components/ui/SectionTabs";

/**
 * Explore's tabs: one per page kind, each its own route (Site Structure A).
 * Validators is the section's front door, so it owns the bare /explore.
 *
 * "Creators" is a decided label but kept swappable: change it here and
 * in the header search's scope list (GlobalSearch SCOPE_OPTIONS).
 */
export const EXPLORE_TABS: readonly SectionTab[] = [
  { label: "Validators", href: "/explore" },
  { label: "Projects", href: "/explore/projects" },
  { label: "Creators", href: "/explore/creators" },
];
