/**
 * FloorBriefing — the logged-in viewer's §O3 status block on `/`.
 *
 * Just <LivingHeader>'s "today" line — the same visual language used
 * at the top of /u/[handle]. DRY by intent: forking that pattern would
 * create two visual languages for the same data.
 *
 * The avatar + rank chip + greeting that used to live here moved into
 * the Composer's collapsed-card header (see Composer.tsx) — the home
 * page was carrying three copies of the viewer's avatar (site header,
 * here, Composer), and the Composer card is the more natural home for
 * "who's posting" since it's the thing the rank chip contextualizes.
 *
 * The rank-progression block (current rank + "X to go" / "Top of the
 * auto-ladder.") is deliberately NOT rendered here either — the
 * Composer's identity column now carries the RankChip right below the
 * viewer's name, immediately under this section, so a second rank
 * readout here was pure duplication.
 *
 * Server component. Data is fetched in page.tsx via getUser() and
 * passed in as a prop; FloorBriefing renders, never derives.
 *
 * Failure modes — the page wrapper passes `profile: null` when the
 * SSR fetch fails, or `profile.living` is absent when the §3.1
 * own-only block didn't come through. Either way this renders nothing.
 */

import { composeTodayLine, LivingHeader } from "@/components/profile/LivingHeader";
import type { MemberProfile } from "@/lib/api/types";

export interface FloorBriefingProps {
  /**
   * The viewer's §3.1 User view-model from /bcc/v1/users/:handle,
   * or null when the SSR fetch failed. Renders only when non-null AND
   * the own-only `living` block came through.
   */
  profile: MemberProfile | null;
}

export function FloorBriefing({ profile }: FloorBriefingProps) {
  if (profile?.living === undefined) return null;

  // Nothing left to show without a "today" line, a comparison, or the
  // (now-dropped) progression block — skip the section so it doesn't
  // leave a blank gap above the Composer.
  if (composeTodayLine(profile.living.today, true) === "" && profile.living.comparison === null) {
    return null;
  }

  return (
    <section
      aria-label="Your shift on the floor"
      className="mx-auto max-w-[1560px] px-2 pt-12 sm:px-3"
    >
      <LivingHeader living={profile.living} hideEmptyShiftFallback />
    </section>
  );
}
