import type { SectionTab } from "@/components/ui/SectionTabs";

/**
 * Members' tabs (Site Structure A). Mentors moved under Members from the
 * old top-level /mentors, which now forwards here. It becomes
 * "Ambassadors" later with no structural change.
 */
export const MEMBERS_TABS: readonly SectionTab[] = [
  { label: "Everyone", href: "/members" },
  { label: "Mentors", href: "/members/mentors" },
];
