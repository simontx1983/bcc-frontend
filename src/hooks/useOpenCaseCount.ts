"use client";

/**
 * useOpenCaseCount — the `disputes_open` slice of the shared /me/badges
 * poll (BadgesProvider): how many of the viewer's own filed disputes are
 * still open. No request of its own.
 *
 * Drives the avatar's dot and the "N open" pill on My cases. Both show
 * only for a whole number above zero. The server sends `null` when it
 * could not read the count, and an older backend sends nothing; those,
 * and anything malformed, read as "no count" rather than as 0 or as a
 * number the server never said.
 */

import { useBadges } from "@/hooks/useBadges";

/** The count when `value` is a finite integer > 0, else null. */
export function openCaseCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

export function useOpenCaseCount(): number | null {
  const { data } = useBadges();
  return openCaseCount(data?.disputes_open);
}
