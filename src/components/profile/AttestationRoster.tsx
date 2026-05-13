"use client";

/**
 * AttestationRoster — §J.6 attestation roster surface. THE primary
 * content of an entity card per the constitution: "who has vouched,
 * who is standing behind." Evidence of backing — NOT a leaderboard,
 * NOT a prestige wall.
 *
 * Phase 1 status: READ-ONLY scaffold. Consumes the locked §J.4
 * response shape (`AttestationRosterItem[]`). Endpoint
 * (`GET /entities/:target_kind/:target_id/attestations`) ships in
 * Phase 1 Week 2 of the implementation plan; until then the roster
 * receives `undefined` items and renders an empty state.
 *
 * Design constraints (Phillip's note: the roster should feel like
 * EVIDENCE of backing, not a leaderboard / prestige wall):
 *
 *   - **Equal row treatment regardless of attestor standing.**
 *     Highly-Reliable attestor rows have the same visual weight
 *     as Newly-Active attestor rows. The Reliability Standing
 *     badge is a small inline marker, not a row-level styling
 *     treatment. No "VIP row" or "highlighted top tier" treatment.
 *   - **No reputation_score on rows.** The contract carries it but
 *     surfacing per-attestor scores on the roster would tier
 *     attestors visually and create caste hierarchy. We render
 *     identity + standing badge + date + (optional) note. That's
 *     enough to read who backed and when.
 *   - **No badge saturation.** Per row, only the Reliability
 *     Standing badge surfaces (one of three positive states).
 *     Other attestor badges (e.g. `early_read`) are NOT surfaced on
 *     roster rows — the `is_pre_consensus_pick` per-row marker
 *     already captures the relevant signal for that attestation.
 *   - **Pre-consensus marker is subtle, not celebratory.** A small
 *     phosphor-tinted "EARLY READ" mark next to the row, not a
 *     glowing badge.
 *   - **Dormancy dimming.** §J.1 long-term graph health: when
 *     `attestor.is_dormant`, the row opacity reduces and an
 *     "INACTIVE" marker appears. Subtle, not punishing — the
 *     attestation still counts; it just signals to the reader that
 *     the attestor isn't currently active on the platform.
 *   - **Revoked rows hidden behind toggle.** Per §J.7 edge-case
 *     heuristic: revocations are NOT hidden from the record. The
 *     toggle preserves "no hiding the past" while keeping the
 *     active roster clean by default.
 *
 * §A2 server-rendering: every piece of attestor data comes from
 * the server-supplied view-model. The kind label ("VOUCHED" /
 * "STOOD BEHIND") and date formatting are presentation only.
 *
 * §J.4.1 synthesis invisibility: weights (`weight_at_time`,
 * `decayed_weight`) are server-side only and do NOT appear in this
 * component's API shape. The roster receives a server-sorted order
 * and renders it; the FE never sees or surfaces the underlying
 * weights.
 *
 * §J.3.2 asymmetric display: only positive Reliability Standing
 * badges render. Attestors without a public standing badge render
 * without one — never with a negative-standing marker.
 *
 * Empty-state copy is load-bearing per risk-assessment §2.9 — the
 * primary mitigation for the "no vouch = bad" interpretation drift
 * is the editorial copy on profiles/cards with zero attestations.
 * Heuristic #9 elevated to risk-mitigation status.
 */

import { useAttestationRoster } from "@/hooks/useAttestationRoster";
import type {
  AttestationRosterItem,
  AttestationTargetKind,
  ReliabilityStandingPublic,
} from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

interface AttestationRosterProps {
  /**
   * Roster rows from `GET /entities/.../attestations`. Server-side
   * sorted (typically by decayed_weight desc per §J.4). When
   * provided, overrides the hook fetch — the component renders
   * this array verbatim (the SSR + admin-preview path).
   */
  items?: AttestationRosterItem[] | undefined;
  /**
   * §J.4 target taxonomy. When `items` is not explicitly provided,
   * the component self-fetches via `useAttestationRoster` using
   * these two props.
   */
  targetKind?: AttestationTargetKind | undefined;
  targetId?: number | undefined;
  /**
   * Empty-state copy — varies by target_kind. Per heuristic #9
   * and risk-assessment §2.9, the empty state is an invitation,
   * not a void. The page passes target-specific copy.
   */
  emptyState: { body: string };
}

const RELIABILITY_LABEL: Record<ReliabilityStandingPublic, string> = {
  highly_reliable: "Highly Reliable",
  consistent: "Consistent",
  newly_active: "Newly Active",
};

export function AttestationRoster({
  items,
  targetKind,
  targetId,
  emptyState,
}: AttestationRosterProps) {
  // Hook fires only when items are NOT explicitly provided AND we
  // have a target. include_revoked=true so the "SHOW REVOKED" toggle
  // below has rows to reveal without a follow-up request.
  const shouldFetch = items === undefined;
  const { data } = useAttestationRoster(
    shouldFetch ? targetKind : undefined,
    shouldFetch ? targetId : undefined,
    { include_revoked: true },
  );

  const effectiveItems: AttestationRosterItem[] | undefined =
    items ?? data?.items;

  // Rollout posture: during the initial query window AND when the
  // server returns zero rows, render the SAME empty-state block.
  // Phillip's note: the surface must progress from empty → populated
  // without emotional-tone changes; rendering a spinner during load
  // would create exactly that kind of state flicker.
  if (effectiveItems === undefined || effectiveItems.length === 0) {
    return <EmptyState body={emptyState.body} />;
  }

  const active = effectiveItems.filter((item) => item.revoked_at === null);
  const revoked = effectiveItems.filter((item) => item.revoked_at !== null);

  // Even with rows, an "active-empty + revoked-only" surface gets the
  // empty-state treatment for the primary list. Revoked stays behind
  // the toggle — Phillip's "no hiding the past" preserved, but
  // not in the foreground when there's nothing currently active.
  if (active.length === 0 && revoked.length > 0) {
    return (
      <section aria-label="Attestation roster" className="flex flex-col">
        <EmptyState body={emptyState.body} />
        <RevokedSection revoked={revoked} />
      </section>
    );
  }

  return (
    <section aria-label="Attestation roster" className="flex flex-col">
      <ul className="flex flex-col">
        {active.map((item) => (
          <RosterRow key={item.id} item={item} />
        ))}
      </ul>
      {revoked.length > 0 && <RevokedSection revoked={revoked} />}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Empty state — designed per heuristic #9 + risk-assessment §2.9.
// "Absence of attestation is not a negative signal" lives at the
// editorial-copy level; the page passes the right target-specific
// invitation. NEVER renders "0 attestations" or a numeric zero.
// ─────────────────────────────────────────────────────────────────────

function EmptyState({ body }: { body: string }) {
  return (
    <div className="border border-dashed border-cardstock/20 px-6 py-8 text-center">
      <p className="font-serif italic text-cardstock-deep">{body}</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Roster row — equal visual treatment regardless of attestor standing.
// No row-level styling tied to tier or reliability. The Reliability
// Standing badge is a small inline marker; nothing else creates
// visual hierarchy between rows.
// ─────────────────────────────────────────────────────────────────────

function RosterRow({ item }: { item: AttestationRosterItem }) {
  const isDormant = item.attestor.is_dormant ?? false;
  const isRevoked = item.revoked_at !== null;
  // Revoked dims more than dormant — revocation is a stronger "no
  // longer active" signal. Both stay visible (no hiding the past
  // per §J.7 edge-case heuristic); both stay readable.
  const rowToneClass = isRevoked
    ? "opacity-40"
    : isDormant
      ? "opacity-50"
      : "";

  const reliabilityLabel =
    item.attestor.reliability_standing !== null
      ? RELIABILITY_LABEL[item.attestor.reliability_standing]
      : null;

  const kindLabel = item.kind === "vouch" ? "VOUCHED" : "STOOD BEHIND";

  return (
    <li
      className={`flex items-start gap-3 border-b border-cardstock/15 py-3 last:border-b-0 ${rowToneClass}`}
    >
      <Avatar
        src={item.attestor.avatar_url}
        initial={item.attestor.handle.charAt(0).toUpperCase()}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="bcc-mono text-cardstock">
            @{item.attestor.handle}
          </span>
          <span className="font-serif text-cardstock-deep">
            {item.attestor.display_name}
          </span>
          {reliabilityLabel !== null && (
            <span className="bcc-mono text-[10px] tracking-[0.18em] text-phosphor">
              {reliabilityLabel.toUpperCase()}
            </span>
          )}
          {isDormant && (
            <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
              INACTIVE
            </span>
          )}
        </div>
        <div className="bcc-mono flex flex-wrap items-baseline gap-x-3 text-[11px] text-cardstock-deep">
          <span>{isRevoked ? `REVOKED · ${kindLabel}` : kindLabel}</span>
          <span>·</span>
          <time dateTime={item.created_at}>
            {formatRelativeTime(item.created_at)}
          </time>
          {item.is_pre_consensus_pick && !isRevoked && (
            <>
              <span>·</span>
              <span className="text-phosphor">EARLY READ</span>
            </>
          )}
        </div>
        {item.context_note !== null && item.context_note !== "" && (
          <p className="mt-1 font-serif text-cardstock italic">
            &ldquo;{item.context_note}&rdquo;
          </p>
        )}
      </div>
    </li>
  );
}

function Avatar({ src, initial }: { src: string; initial: string }) {
  if (src === "") {
    return (
      <div
        aria-hidden
        className="bcc-stencil flex h-10 w-10 shrink-0 items-center justify-center border border-cardstock/30 bg-cardstock-deep/30 text-lg text-cardstock"
      >
        {initial}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={40}
      height={40}
      className="h-10 w-10 shrink-0 border border-cardstock/30 object-cover"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────
// Revoked section — hidden behind a toggle by default per §J.7
// edge-case heuristic. Preserves "no hiding the past" while keeping
// the active roster clean. Revoked rows render dimmed when revealed
// — the attestation is part of the historical record, not erased.
// ─────────────────────────────────────────────────────────────────────

function RevokedSection({ revoked }: { revoked: AttestationRosterItem[] }) {
  return (
    <details className="mt-4 border-t border-dashed border-cardstock/15 pt-3">
      <summary className="bcc-mono cursor-pointer text-[11px] tracking-[0.18em] text-cardstock-deep hover:text-cardstock">
        SHOW REVOKED ({revoked.length})
      </summary>
      <ul className="mt-2 flex flex-col">
        {revoked.map((item) => (
          <RosterRow key={item.id} item={item} />
        ))}
      </ul>
    </details>
  );
}