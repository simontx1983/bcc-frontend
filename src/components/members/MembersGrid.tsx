"use client";

/**
 * MembersGrid — card grid for the /members directory.
 *
 * Pure layout shell. Each card is a `FlippableMemberCard` (front face:
 * cover + cream + avatar at the seam; back face: trust dossier). Click
 * to flip; clicking "OPEN PROFILE →" on the back navigates to
 * /u/:handle.
 *
 * Visual + behavioral parity with the §4.7.4 communities discovery
 * grid (see `FlippableNftCard`): both consume the shared `<FlipCard>`
 * primitive in `components/ui/`, so the two directories feel like the
 * same product — same aspect-square outer, same flip mechanic, same
 * "OPEN COMMUNITY / PROFILE →" treatment on the back.
 *
 * Empty state is handled at the page level (`/members/page.tsx`); this
 * component renders nothing when there are no items and lets the page
 * decide between `RosterEmpty` (no search, no filter) vs.
 * `RosterFilterEmpty` (filter active, suggestion chips).
 */

import { FlippableMemberCard } from "@/components/members/FlippableMemberCard";
import type { MemberSummary } from "@/lib/api/types";

interface MembersGridProps {
  items: readonly MemberSummary[];
}

export function MembersGrid({ items }: MembersGridProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((member) => (
        <li key={member.id}>
          <FlippableMemberCard member={member} />
        </li>
      ))}
    </ul>
  );
}
