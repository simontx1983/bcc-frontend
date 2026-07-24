"use client";

/**
 * §K3 ChainTabs — multi-chain identity strip on validator profiles.
 *
 * Mounts when an operator runs validators on 2+ chains and has linked
 * each wallet to the same peepso-page. Renders a horizontal pill row
 * with one chip per chain showing the chain name + a verified marker.
 *
 * The chip used to show a truncated operator address; that was removed
 * for privacy (see CardChain.operator_verified in lib/api/types.ts).
 *
 *   ┌──────── strict V1.5 scope ──────────────────────────────────────┐
 *   │ Visual only. The pills are NOT yet active state — they don't   │
 *   │ filter stats, reviews, or signals. Per-chain stats swap is V2  │
 *   │ (requires `stats_by_chain` decomposition on the view-model).   │
 *   │ Today the strip's job is to communicate "this operator runs   │
 *   │ on these chains" — single-chain pages don't render it at all. │
 *   └────────────────────────────────────────────────────────────────┘
 *
 * Server contract: `card.chains` is `CardChain[] | null`. The list is
 * null for single-chain pages (the common case) so the frontend can
 * branch with a single null check; the resolver guarantees length ≥ 2
 * when non-null.
 *
 * Operator addresses are intentionally truncated with mid-ellipsis —
 * the full string is on the card back face's stats panel and the
 * external chain explorer link from §V1.5 wallet management.
 */

import type { CardChain } from "@/lib/api/types";

interface ChainTabsProps {
  chains: CardChain[];
}

export function ChainTabs({ chains }: ChainTabsProps) {
  if (chains.length < 2) {
    return null;
  }

  return (
    <section
      aria-label="Chains this operator runs on"
      className="bcc-panel mt-6 flex flex-col gap-3 p-5"
    >
      <header className="flex items-baseline justify-between gap-3">
        <span className="bcc-mono text-[10px] tracking-[0.24em] text-cardstock-deep">
          CROSS-CHAIN //
        </span>
        <span className="bcc-mono text-[10px] tracking-[0.18em] text-bcc-text-secondary/70">
          {chains.length} CHAINS
        </span>
      </header>

      <ul className="flex flex-wrap gap-2" role="list">
        {chains.map((chain) => (
          <li key={chain.slug} className="shrink-0">
            <ChainPill chain={chain} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ChainPill({ chain }: { chain: CardChain }) {
  return (
    <div
      className="bcc-mono inline-flex items-center gap-2 rounded-sm border-2 border-cardstock-edge bg-cardstock px-3 py-1.5 text-[11px] tracking-[0.14em]"
      style={{
        // Per-chain accent comes from the same CSS-variable family as
        // the card crest backgrounds (see globals.css). Falls back to
        // ink-soft when the chain isn't in the design-token set yet.
        boxShadow: `inset 0 -3px 0 var(--chain-${chain.slug}, var(--ink-soft))`,
      }}
    >
      <span className="text-ink">{chain.name.toUpperCase()}</span>
      {chain.operator_verified && (
        <>
          <span aria-hidden className="text-cardstock-edge">
            ·
          </span>
          {/*
            Was a truncated operator address. Removed 2026-07-23 — the
            operator address is matched against the claimant's verified
            wallet, so publishing it (truncated or not) bound an on-chain
            address to a named member. The derived boolean carries the
            same meaning the strip actually needs: this operator is
            verified on this chain. See docs/wallet-privacy-policy.md.
          */}
          <span className="text-ink-soft">VERIFIED</span>
        </>
      )}
    </div>
  );
}