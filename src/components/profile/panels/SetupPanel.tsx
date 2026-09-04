"use client";

/**
 * SetupPanel — owner-only operator-file hub.
 *
 * Originally a single cold-start checklist (Write Bio / Link Wallet /
 * Join a Hall). Restructured in PR-11b into a three-sub-tab hub, then
 * trimmed on 2026-05-14 to TWO sub-tabs after the Checklist was folded
 * into Standing:
 *
 *   - STANDING    — full StandingFileBody (mirrors /me/progression).
 *   - RELIABILITY — full ReliabilityMirrorBody (mirrors /me/reliability).
 *
 * The cold-start items the Checklist used to surface (bio / wallet /
 * local) now live as rows inside StandingFileBody → VERIFIED IDENTITY,
 * so a single sub-tab can answer "where am I in setup?" alongside the
 * rest of the operator's standing.
 *
 * ## The sub-tab strip moved out
 *
 * The profile regrouping (11 top-level tabs → 5) FLATTENED those two
 * sections into first-class leaves of the Reputation group, so the strip
 * that used to live in this file is now the group's own child strip and
 * this component renders ONE section, chosen by `section`.
 *
 * That is what makes them addressable: `?tab=setup` is Standing (exactly
 * where that link already landed, since `standing` was this panel's
 * default) and `?tab=reliability` is Reliability, which previously had no
 * URL at all — it was reachable only by clicking, and a refresh threw the
 * operator back to Standing.
 *
 * Sections EMBED the full page content rather than linking out. The
 * standalone routes still exist for §J.7 deeplinks + footer
 * navigation; the embedded versions are identical content, sharing
 * the same body components (StandingFileBody / ReliabilityMirrorBody)
 * so the two surfaces cannot drift.
 *
 * Reliability data is fetched server-side in /u/[handle]/page.tsx
 * when the viewer is the owner, then passed through ProfileTabs to
 * here. Visitors viewing someone else's profile don't see the Setup
 * tab at all (ownerOnly gate); reliability prop arrives undefined
 * on the rare race condition (cache, partial outage) and the sub-tab
 * falls back to a soft error.
 *
 * §2.7 cadence-pressure note: every string here is descriptive. No
 * "haven't done X", no "you should attest", no streak language. The
 * cadence-pressure-guard.sh enforces this mechanically.
 *
 * Owner-only — ProfileTabs gates the parent tab on isOwner.
 */

import Link from "next/link";
import type { Route } from "next";

import { ReliabilityMirrorBody } from "@/components/profile/ReliabilityMirrorBody";
import { StandingFileBody } from "@/components/profile/StandingFileBody";
import type {
  MemberProfile,
  MeReliabilityResponse,
} from "@/lib/api/types";

/** The two sections this panel can render. One is on screen at a time. */
export type SetupSection = "standing" | "reliability";

export interface SetupPanelProps {
  /** Full operator profile — drives the STANDING body. */
  profile: MemberProfile;
  /**
   * Self-mirror payload. Owner-only; undefined when the parent
   * fetched failed or the viewer isn't the owner (shouldn't happen
   * in practice since the parent tab is owner-gated).
   */
  reliability: MeReliabilityResponse | undefined;
  /** Which section to render. Selection lives in the URL, not here. */
  section: SetupSection;
}

export function SetupPanel({ profile, reliability, section }: SetupPanelProps) {
  if (section === "standing") {
    return <StandingFileBody profile={profile} />;
  }
  return reliability !== undefined ? (
    <ReliabilityMirrorBody reliability={reliability} />
  ) : (
    <ReliabilityUnavailable />
  );
}


// ──────────────────────────────────────────────────────────────────────
// ReliabilityUnavailable — soft fallback when the parent fetch failed.
// ──────────────────────────────────────────────────────────────────────

function ReliabilityUnavailable() {
  return (
    <div className="bcc-panel flex flex-col gap-3 p-6">
      <p className="bcc-mono text-safety" style={{ fontSize: "10px", letterSpacing: "0.24em" }}>
        UNAVAILABLE
      </p>
      <p className="font-serif text-base text-bcc-text-secondary">
        Your reliability surface couldn&rsquo;t load this time. Try
        again in a moment, or open the full mirror directly.
      </p>
      <Link
        href={"/me/reliability" as Route}
        className="bcc-mono text-safety hover:underline underline-offset-4 self-start"
      >
        Open your mirror →
      </Link>
    </div>
  );
}
