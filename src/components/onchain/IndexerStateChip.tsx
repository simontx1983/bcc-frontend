/**
 * IndexerStateChip — renders the §3.6 `IndexerState` embed for one
 * chain. The picker (and any future surface that consumes
 * HoldingsService output) uses this to show a "Syncing…" /
 * "indexer degraded" affordance so the user is never quietly served
 * stale on-chain holdings.
 *
 * Server contract (§3.6):
 *   - `label` is server-pre-formatted display copy. Render verbatim —
 *     no client-side enum→label mapping. Filterable on the PHP side via
 *     `bcc_holdings_indexer_state_label`.
 *   - `state` is the typed enum. Used here only to pick a Tailwind
 *     color class for the label span; that's presentation styling
 *     keyed off a stable enum, not a label decision.
 *   - An empty `label` is the contract's "no chip" signal (the
 *     `healthy` case). This component returns null so callers can map
 *     unconditionally without guarding.
 *
 * No `"use client"` — pure presentation. Safe in server components.
 *
 * Colours are theme-aware (#201): the chip sits on the Dialog panel,
 * which flips with the theme. Fixed blueprint navy and ink-ghost read
 * at 1.05:1 and 2.92:1 on the dark panel.
 */

const COLOR_BY_STATE: Record<string, string> = {
  syncing:  "text-bcc-text",
  degraded: "text-safety",
};

export function IndexerStateChip({
  chain,
  state,
  label,
}: {
  chain: string;
  state: string;
  label: string;
}) {
  if (label === "") return null;
  const stateColor = COLOR_BY_STATE[state] ?? "text-bcc-text-secondary";
  return (
    <span
      className="bcc-mono text-bcc-text-secondary"
      style={{ fontSize: "10px", letterSpacing: "0.18em" }}
    >
      <span className="text-safety">{chain.toUpperCase()}</span>
      <span className="ml-2">&middot;</span>
      <span className={`ml-2 ${stateColor}`}>{label}</span>
    </span>
  );
}
