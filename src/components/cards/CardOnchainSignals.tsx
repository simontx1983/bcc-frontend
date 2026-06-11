/**
 * On-chain card sections — the validator signal surfaces shared by the
 * CardFactory front and back faces. Extracted from CardFactory.tsx
 * (Phase 3.3 god-component split); markup and behavior unchanged.
 */

import type { OnchainSignals } from "@/lib/api/types";

/**
 * OnchainSignalsStrip — front-face status indicator for a validator
 * card. Surfaces only the two signals a viewer needs to size up the
 * operator at a glance: chain status (active / jailed / inactive)
 * and 30-day uptime.
 *
 * The richer data (self stake, commission, voting rank, delegators,
 * total stake, jailed events) lives on the BACK face of the card —
 * a flip surfaces it inline, and the full breakdown also renders on
 * /v/[slug] in EntityProfile. This strip is the "should I keep
 * reading?" prompt; the back is the "ok, tell me more."
 *
 * Hides itself entirely when both status and uptime are missing
 * (transient indexer state). Renders status alone when uptime is
 * still null — partial data is still useful.
 */
export function OnchainSignalsStrip({ signals }: { signals: OnchainSignals }) {
  const segments: string[] = [];

  const statusLabel =
    signals.status === "active"
      ? "ACTIVE"
      : signals.status === "inactive"
      ? "INACTIVE"
      : signals.status === "jailed"
      ? "JAILED"
      : null;
  if (statusLabel !== null) {
    segments.push(statusLabel);
  }

  if (signals.uptime_30d !== null) {
    segments.push(`${(signals.uptime_30d * 100).toFixed(1)}% UPTIME`);
  }

  if (segments.length === 0) {
    return null;
  }

  return (
    <div
      className="relative z-10 flex items-center gap-2 overflow-hidden border-t border-cardstock-edge/40 px-3 py-1.5"
      style={{ background: "rgba(15,13,9,0.03)" }}
    >
      <span
        aria-hidden
        className="bcc-rail-dot"
        style={
          signals.status === "jailed"
            ? { background: "var(--safety, #ff6b35)" }
            : undefined
        }
      />
      <span className="bcc-mono whitespace-nowrap overflow-hidden text-ellipsis text-[9px] tracking-[0.18em] text-ink-soft">
        {segments.join(" · ")}
      </span>
    </div>
  );
}

/**
 * OnchainStatsList — back-face list of the validator's deeper on-chain
 * data, formatted in the same dl-pair vocabulary as the BCC reputation
 * stats above it. Renders only the fields the indexer has populated so
 * a partially-enriched validator doesn't show "—%" placeholders.
 *
 * Sits beneath card.stats on the back face. The front-face strip
 * carries status + uptime; this list carries commission, self stake,
 * voting rank, total stake, delegators, and jailed-events count.
 */
export function OnchainStatsList({ signals }: { signals: OnchainSignals }) {
  const rows: Array<{ key: string; label: string; value: string }> = [];

  if (signals.commission_rate !== null) {
    rows.push({
      key: "commission",
      label: "Commission",
      value: `${(signals.commission_rate * 100).toFixed(2)}%`,
    });
  }
  if (signals.self_stake !== null) {
    rows.push({
      key: "self_stake",
      label: "Self Delegation",
      value: formatStakeCompact(signals.self_stake),
    });
  }
  if (signals.voting_power_rank !== null) {
    rows.push({
      key: "rank",
      label: "Voting Rank",
      value: `#${signals.voting_power_rank}`,
    });
  }
  if (signals.total_stake !== null) {
    rows.push({
      key: "total_stake",
      label: "Total Stake",
      value: formatStakeCompact(signals.total_stake),
    });
  }
  if (signals.delegator_count !== null) {
    rows.push({
      key: "delegators",
      label: "Delegators",
      value: signals.delegator_count.toLocaleString(),
    });
  }
  if (signals.jailed_count !== null && signals.jailed_count > 0) {
    rows.push({
      key: "jailed",
      label: "Jailed Events",
      value: signals.jailed_count.toLocaleString(),
    });
  }

  if (rows.length === 0) {
    return null;
  }

  return (
    <>
      <div className="bcc-mono mt-4 flex items-center gap-2 text-[9px] tracking-[0.24em] text-ink-soft">
        <span className="inline-block h-px w-6 bg-cardstock-edge/50" />
        <span>ON-CHAIN</span>
        <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
      </div>
      <dl className="mt-2 space-y-2 text-sm">
        {rows.map((row) => (
          <div key={row.key} className="flex justify-between gap-4">
            <dt className="bcc-mono text-ink-soft">{row.label}</dt>
            <dd className="font-serif text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

// Compact stake formatter for back-face dl pairs — same vocabulary as
// EntityProfile's formatStake (K / M suffix) but with no decimal places
// on the K branch so the column reads cleanly. Falls back to the raw
// string when the value can't be parsed (preserves Cosmos precision).
function formatStakeCompact(raw: string): string {
  const num = Number(raw);
  if (!Number.isFinite(num)) {
    return raw;
  }
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toLocaleString(undefined, {
      maximumFractionDigits: 1,
    })}M`;
  }
  if (num >= 1_000) {
    return `${Math.round(num / 1_000).toLocaleString()}K`;
  }
  return num.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
