/**
 * FloorBriefing — the logged-in viewer's personal status block on `/`.
 *
 * Replaces the placeholder "The Floor" hero on the auth branch of the
 * home page. The logged-in home is a daily driver, not a marketing
 * surface — this component is dense and operational, not theatrical.
 *
 * Two pieces:
 *   1. Personalized greeting   — handle + a one-line standing summary
 *      sourced from the §3.1 top-level `is_in_good_standing` boolean.
 *   2. <LivingHeader> reused   — §O3 streak / today / rank progression,
 *      the same visual language used at the top of /u/[handle]. DRY by
 *      intent: forking that pattern would create two visual languages
 *      for the same data.
 *
 * Server component. Data is fetched in page.tsx via getUser() and
 * passed in as a prop; FloorBriefing renders, never derives.
 *
 * Failure modes — the page wrapper passes `profile: null` when the
 * SSR fetch fails. We render only the greeting in that case. When
 * `profile` is non-null but the viewer is on someone else's
 * /users/:handle (impossible on this page but defensive), the §3.1
 * own-only blocks (`living`, `progression`) are absent and the §O3
 * status block silently collapses.
 */

import { LivingHeader } from "@/components/profile/LivingHeader";
import type { MemberProfile } from "@/lib/api/types";

export interface FloorBriefingProps {
  /** The viewer's BCC handle, sourced from the NextAuth session. */
  handle: string;
  /**
   * The viewer's §3.1 User view-model from /bcc/v1/users/:handle,
   * or null when the SSR fetch failed. Status grid only renders when
   * non-null AND the own-only `living` block came through.
   */
  profile: MemberProfile | null;
}

export function FloorBriefing({ handle, profile }: FloorBriefingProps) {
  return (
    <section
      aria-label="Your shift on the floor"
      className="mx-auto max-w-[1560px] px-6 pb-10 pt-12 lg:px-8"
    >
      <Greeting handle={handle} profile={profile} />

      {/* §O3 status block — own-only blocks (`living`, `progression`)
          arrive on /users/:handle when is_self === true. Both are
          marked optional in the §3.1 type so we guard at the render.
          Sprint 4: hideEmptyShiftFallback=true so the "Quiet shift"
          line collapses on the home page when there's no activity
          today — the DiscoverPanel below already says "Quiet on the
          Floor" once; three sequential quiet signals reads as the
          app over-apologizing. */}
      {profile?.living !== undefined && (
        <div className="mt-10 border-t border-cardstock/10 pt-8">
          <LivingHeader
            living={profile.living}
            progression={profile.progression}
            hideEmptyShiftFallback
          />
        </div>
      )}
    </section>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Greeting — kicker + stencil headline + one-line standing summary.
// Branches on the §3.1 top-level `is_in_good_standing` boolean.
// ──────────────────────────────────────────────────────────────────────

function Greeting({
  handle,
  profile,
}: {
  handle: string;
  profile: MemberProfile | null;
}) {
  // Standing line — three branches:
  //   - profile fetch failed → neutral welcome
  //   - in good standing → affirming line (no specific date — §3.1
  //     doesn't ship a "since" timestamp)
  //   - out of good standing → neutral redirect (we don't shame on
  //     the home page; HighlightStrip below is where remediation
  //     prompts surface if any)
  const standingLine = (() => {
    if (profile === null) {
      return "Welcome back to the Floor.";
    }
    if (profile.is_in_good_standing) {
      return "Good standing held. Floor's open.";
    }
    return "The floor's open. Pick your next move below.";
  })();

  return (
    <div>
      <p className="bcc-mono text-safety">WELCOME BACK</p>

      <h1 className="bcc-stencil mt-3 text-cardstock leading-[0.95] text-[clamp(2.5rem,6.5vw,5.5rem)]">
        Operator{" "}
        <span className="text-safety">@{handle}</span>
        <span className="text-cardstock">.</span>
      </h1>

      <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-cardstock-deep sm:text-xl">
        {standingLine}
      </p>
    </div>
  );
}
