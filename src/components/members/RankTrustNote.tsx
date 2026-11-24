"use client";

/**
 * RankTrustNote — Members' first-visit note (Site Structure A, design §4,
 * template slot 7): a member card carries a RANK pill and a TRUST number,
 * and people read them as the same thing. Two sentences say which is which.
 *
 * Shown once. "Got it" records the id in the tours seen-set (TourContext
 * `markSeen`): server-synced for a signed-in member, so it stays dismissed
 * on their other devices, and local for a guest. It waits for that set to
 * be trustworthy (`seenReady`) so it never flashes for someone who has
 * already dismissed it on another device.
 *
 * Optional chrome: it reads the context directly rather than through
 * `useTour` (which throws outside the provider), so a surface without
 * <TourProvider> simply renders no note.
 */

import { useContext } from "react";

import { TourContext } from "@/components/tour/TourProvider";

/** Seen-set id. Matches the server's tour-id pattern ([a-z0-9][a-z0-9_-]*). */
export const RANK_TRUST_NOTE_ID = "members-intro";

export function RankTrustNote() {
  const tour = useContext(TourContext);
  if (tour === null || !tour.seenReady || tour.hasSeen(RANK_TRUST_NOTE_ID)) {
    return null;
  }

  return (
    <aside
      aria-label="Rank and trust"
      className="flex flex-wrap items-start gap-4 border border-bcc-border border-l-4 border-l-bcc-accent bg-bcc-surface-hover px-4 py-3"
    >
      <p className="min-w-0 flex-1 basis-[16rem] font-serif text-bcc-text">
        <strong>Rank and trust are two things.</strong> The pill is someone&apos;s
        rank: what they&apos;ve done on BCC themselves. Its dot colour and the
        Trust number are how other members rate them: vouches, reviews and
        disputes.
      </p>
      <button
        type="button"
        onClick={() => tour.markSeen(RANK_TRUST_NOTE_ID)}
        className="bcc-btn bcc-btn-outline min-h-[44px] shrink-0"
      >
        Got it
      </button>
    </aside>
  );
}
