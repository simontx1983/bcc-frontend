"use client";

/**
 * SetupPanel — owner-only operator-file hub.
 *
 * Originally a single cold-start checklist (Write Bio / Link Wallet /
 * Join a Local). Restructured in PR-11b into a three-sub-tab hub, then
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
 * Sub-tabs EMBED the full page content rather than linking out. The
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

import { useState } from "react";
import Link from "next/link";
import type { Route } from "next";

import { ReliabilityMirrorBody } from "@/components/profile/ReliabilityMirrorBody";
import { StandingFileBody } from "@/components/profile/StandingFileBody";
import type {
  MemberProfile,
  MeReliabilityResponse,
} from "@/lib/api/types";

export interface SetupPanelProps {
  /** Full operator profile — drives the STANDING sub-tab body. */
  profile: MemberProfile;
  /**
   * Self-mirror payload. Owner-only; undefined when the parent
   * fetched failed or the viewer isn't the owner (shouldn't happen
   * in practice since the parent tab is owner-gated).
   */
  reliability: MeReliabilityResponse | undefined;
}

type SubTabKey = "standing" | "reliability";

interface SubTabDef {
  key: SubTabKey;
  label: string;
}

const SUB_TABS: ReadonlyArray<SubTabDef> = [
  { key: "standing",    label: "Standing" },
  { key: "reliability", label: "Reliability" },
];

export function SetupPanel(props: SetupPanelProps) {
  const [active, setActive] = useState<SubTabKey>("standing");

  return (
    <div className="flex flex-col gap-4">
      <SubTabNav active={active} onSelect={setActive} />

      {active === "standing" && (
        <StandingFileBody profile={props.profile} />
      )}
      {active === "reliability" && (
        props.reliability !== undefined ? (
          <ReliabilityMirrorBody reliability={props.reliability} />
        ) : (
          <ReliabilityUnavailable />
        )
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// SubTabNav — visually subordinate to the parent ProfileTabs strip but
// uses the same cardstock-on-dark palette so the contrast reads right
// against the page backdrop. Active sub-tab gets the safety-orange
// underline matching `.bcc-tab[aria-selected="true"]`.
// ──────────────────────────────────────────────────────────────────────

function SubTabNav({
  active,
  onSelect,
}: {
  active: SubTabKey;
  onSelect: (key: SubTabKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Setup sections"
      className="flex items-center gap-x-1 border-b border-cardstock/15"
    >
      {SUB_TABS.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onSelect(tab.key)}
          className={
            "bcc-mono shrink-0 border-b-2 px-4 py-2 transition " +
            (active === tab.key
              ? "border-safety text-cardstock"
              : "border-transparent text-cardstock-deep hover:text-cardstock")
          }
          style={{ fontSize: "12px", letterSpacing: "0.18em" }}
        >
          {tab.label.toUpperCase()}
        </button>
      ))}
    </div>
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
      <p className="font-serif text-base text-ink-soft">
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
