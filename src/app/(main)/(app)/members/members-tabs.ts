import type { SectionTab } from "@/components/ui/SectionTabs";

/** Members' section header (Site Structure A §10): the menu word as title. */
export const MEMBERS_SECTION = {
  eyebrow: "MEMBERS · PEOPLE",
  title: "Members",
  lede: "The people on BCC: find them by trust, rank and what they run.",
} as const;

/**
 * Members' tabs (Site Structure A). Mentors moved under Members from the
 * old top-level /mentors, which now forwards here. It becomes
 * "Ambassadors" later with no structural change.
 */
export const MEMBERS_TABS: readonly SectionTab[] = [
  { label: "Everyone", href: "/members" },
  { label: "Mentors", href: "/members/mentors" },
];
