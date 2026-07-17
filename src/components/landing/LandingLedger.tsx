/**
 * LandingLedger — the hero's live-looking reputation ledger panel.
 * These are illustrative sample events, not a real endpoint (per the
 * handover — the bounded feed peek further down the page carries the
 * "it's live and real" proof with actual posts). Server component: the
 * scroll is pure CSS (`@keyframes bcc-ldg-rise` over a doubled list), no
 * client JS needed.
 */

type EventKind = "vouch" | "review" | "dispute" | "attest";

interface LedgerEvent {
  kind: EventKind;
  handle: string;
  verb: string;
  target: string;
  detail: string;
  tag: "TRUST" | "CAUTION" | null;
}

const EVENTS: readonly LedgerEvent[] = [
  { kind: "vouch", handle: "@coldforge", verb: "vouched", target: "@stakehouse", detail: "peer vouch · weight +1", tag: null },
  { kind: "review", handle: "@merkle.dev", verb: "reviewed", target: "Injective Validator", detail: "on-chain review", tag: "TRUST" },
  { kind: "dispute", handle: "@nakamoto99", verb: "disputed", target: "“airdrop farm”", detail: "flagged for panel", tag: "CAUTION" },
  { kind: "attest", handle: "@onchain.kate", verb: "attested for", target: "@blockmason", detail: "contract audits · marked solid", tag: null },
  { kind: "review", handle: "@satoshigrl", verb: "reviewed", target: "Cosmos Hub Node", detail: "uptime verified", tag: "TRUST" },
  { kind: "vouch", handle: "@rustyrig", verb: "vouched", target: "@coldforge", detail: "2 yrs on the floor", tag: null },
  { kind: "dispute", handle: "@ledgerhand", verb: "disputed", target: "fake attestation", detail: "evidence attached", tag: "CAUTION" },
  { kind: "attest", handle: "@blockmason", verb: "attested for", target: "@merkle.dev", detail: "MEV defense · marked solid", tag: null },
  { kind: "review", handle: "@nodesmith", verb: "reviewed", target: "Celestia DA", detail: "slashing history clean", tag: "TRUST" },
  { kind: "vouch", handle: "@deepstake", verb: "vouched", target: "@nodesmith", detail: "worked a season", tag: null },
];

const DOT_COLOR: Record<EventKind, string> = {
  vouch: "var(--bcc-trust-trusted)",
  review: "var(--bcc-info)",
  dispute: "var(--bcc-trust-risky)",
  attest: "var(--bcc-trust-elite)",
};

const TAG_COLOR: Record<NonNullable<LedgerEvent["tag"]>, string> = {
  TRUST: "var(--bcc-trust-trusted)",
  CAUTION: "var(--bcc-trust-risky)",
};

function LedgerRow({ event }: { event: LedgerEvent }) {
  return (
    <div className="bcc-ldg-row">
      <span
        aria-hidden
        className="bcc-ldg-row-dot"
        style={{ background: DOT_COLOR[event.kind], color: DOT_COLOR[event.kind] }}
      />
      <div className="bcc-ldg-row-body">
        <div className="bcc-ldg-row-l1">
          <span className="h">{event.handle}</span> <span className="v">{event.verb}</span> {event.target}
          {event.tag !== null && (
            <span className="bcc-ldg-tag" style={{ color: TAG_COLOR[event.tag] }}>
              {event.tag}
            </span>
          )}
        </div>
        <div className="bcc-ldg-row-l2">{event.detail}</div>
      </div>
    </div>
  );
}

export function LandingLedger() {
  const doubled = [...EVENTS, ...EVENTS];
  return (
    <div className="bcc-ldg-ledger" aria-label="Live reputation activity (sample)">
      <div className="bcc-ldg-ledger-head">
        <span className="t">Reputation Ledger</span>
        <span className="bcc-ldg-ledger-live">
          <i aria-hidden />
          On the floor now
        </span>
      </div>
      <div className="bcc-ldg-ledger-scan" aria-hidden />
      <div className="bcc-ldg-ledger-feed">
        <div className="bcc-ldg-ledger-col">
          {doubled.map((event, idx) => (
            <LedgerRow key={idx} event={event} />
          ))}
        </div>
      </div>
    </div>
  );
}
