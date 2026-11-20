"use client";

/**
 * "HIDDEN FROM YOUR PROFILE" — the owner's reminder that a section they
 * can still see is switched off for everyone else.
 *
 * Mount for the OWNER only. The server's `profile.sections` is all-true
 * for the owner by design, so the owner's hidden state has to come from
 * their own prefs: this reads the same `useProfilePrefs` cache entry the
 * Edit About form writes, so a save there updates the marker here without
 * a refetch. Renders nothing while loading, on error, or when shown.
 */

import { useProfilePrefs } from "@/hooks/useProfilePrefs";
import { isSectionPrefShown, type SectionPrefKey } from "@/lib/profile/profile-sections";

export function HiddenFromProfileMarker({
  prefKeys,
}: {
  /** Hidden when ANY of these is off (a card can sit behind two switches). */
  prefKeys: readonly SectionPrefKey[];
}) {
  const { data } = useProfilePrefs();
  if (data === undefined) return null;
  if (prefKeys.every((key) => isSectionPrefShown(data, key))) return null;
  return (
    <span
      className="bcc-mono inline-flex shrink-0 items-center rounded-sm border border-bcc-border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] text-bcc-text-secondary"
      data-testid="hidden-from-profile"
    >
      Hidden from your profile
    </span>
  );
}
