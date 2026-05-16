"use client";

/**
 * BackingPanel — §J.6 trust-graph view, two sub-tabs:
 *
 *   - RECEIVED — the AttestationRoster: who vouched for / stood behind
 *     this operator. The constitutional "who has backed" surface; the
 *     panel default.
 *   - GIVEN    — what THIS operator has endorsed. The inverse direction.
 *     Distinct read endpoint (`GET /users/:handle/endorsements`); same
 *     anti-leaderboard row treatment as the AttestationRoster (no
 *     reputation_score per row, equal visual weight, server-rendered
 *     display strings only).
 *
 * Sub-tab state is local (not URL-synced) — the trust-graph deep-link
 * lives on the parent BACKING tab; sub-tab is a within-panel toggle.
 *
 * Empty-state copy on Received branches on reputation per the earlier
 * UX review: for high-reputation operators (score ≥ 50) the "hasn't
 * been backed yet" phrasing contradicts visible trust data; we swap
 * to an aspirational frame inviting the viewer to be first. The Given
 * empty state is observational ("hasn't endorsed any pages yet") —
 * absence is not framed as a negative signal per §J risk-mitigation §2.9.
 */

import { useState } from "react";

import { AttestationRoster } from "@/components/profile/AttestationRoster";
import { EndorsementsGivenView } from "@/components/profile/EndorsementsGivenView";

type SubTab = "received" | "given";

export interface BackingPanelProps {
  /** Handle for the GIVEN sub-tab fetch (per-handle public read). */
  handle: string;
  /** Target user_id for the RECEIVED sub-tab attestation-roster fetch. */
  targetUserId: number;
  /** Reputation score (resolved on the profile) — drives the
   *  Received empty-state copy branch. */
  reputationScore: number;
}

export function BackingPanel({
  handle,
  targetUserId,
  reputationScore,
}: BackingPanelProps) {
  const [sub, setSub] = useState<SubTab>("received");

  const receivedEmpty =
    reputationScore >= 50
      ? "Score earned through floor activity. No one has formally backed this operator yet — be the first."
      : "This operator hasn't been backed yet. Their reputation will form as they participate.";

  return (
    <div className="flex flex-col">
      <SubTabStrip active={sub} onChange={setSub} />
      <div className="mt-3">
        {sub === "received" && (
          <AttestationRoster
            targetKind="user_profile"
            targetId={targetUserId}
            emptyState={{ body: receivedEmpty }}
          />
        )}
        {sub === "given" && <EndorsementsGivenView handle={handle} />}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SubTabStrip — the within-panel toggle. Brutalist mono labels, hi-vis
// underline on the active tab. Keyboard-accessible via standard button
// semantics; the active tab carries aria-pressed so screen readers
// can announce which face of the trust graph is currently rendered.
// ─────────────────────────────────────────────────────────────────────

function SubTabStrip({
  active,
  onChange,
}: {
  active: SubTab;
  onChange: (next: SubTab) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Backing direction"
      className="flex gap-4 border-b border-cardstock/15"
    >
      <SubTabButton
        label="RECEIVED"
        isActive={active === "received"}
        onClick={() => onChange("received")}
      />
      <SubTabButton
        label="GIVEN"
        isActive={active === "given"}
        onClick={() => onChange("given")}
      />
    </div>
  );
}

function SubTabButton({
  label,
  isActive,
  onClick,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      className={`bcc-mono px-1 py-2 text-[11px] tracking-[0.2em] transition motion-reduce:transition-none ${
        isActive
          ? "text-cardstock border-b-2 border-safety -mb-px"
          : "text-cardstock-deep hover:text-cardstock"
      }`}
    >
      {label}
    </button>
  );
}
