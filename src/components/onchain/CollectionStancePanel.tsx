"use client";

/**
 * CollectionStancePanel — "your collections, your call."
 *
 * Rendered after a wallet links and as an onboarding step. One row per
 * collection the viewer's wallets hold, with a state-dependent button
 * pair (three states, two buttons — the positive slot changes):
 *
 *   live     → [Join this community]  + [Report as spam]
 *   waitlist → [Join the waitlist]    + [Report as spam]
 *
 * Why this exists: passive holdings are forgeable (airdrop spam), so
 * community demand is measured by these EXPLICIT declarations instead.
 * The waitlist count ranks the operator's verification queue; enough
 * spam reports hide a collection from everyone.
 *
 * The join button drives the EXISTING gate-checked holder-group join;
 * stances go through /me/collection-stances. Both toggles are
 * retractable — a stance is the user's testimony, not a commitment.
 */

import { useState } from "react";

import { useJoinHolderGroupMutation } from "@/hooks/useHolderGroups";
import {
  useClearCollectionStance,
  useCollectionStancePanel,
  useSetCollectionStance,
} from "@/hooks/useCollectionStances";
import { humanizeCode } from "@/lib/api/errors";
import type { CollectionStancePanelItem } from "@/lib/api/types";

interface CollectionStancePanelProps {
  /**
   * Compact skips the header (host surface provides its own — e.g. the
   * onboarding step title).
   */
  compact?: boolean;
}

export function CollectionStancePanel({ compact = false }: CollectionStancePanelProps) {
  const panel = useCollectionStancePanel();

  if (panel.isPending) {
    return <p className="bcc-mono text-cardstock-deep">Reading your collections…</p>;
  }

  if (panel.isError) {
    return (
      <p role="alert" className="bcc-mono text-safety">
        {/* §γ — copy keyed on err.code; never render err.message. */}
        {humanizeCode(
          panel.error,
          {
            bcc_unauthorized: "Sign in to see your collections.",
            bcc_rate_limited: "Loading too fast — give it a moment and try again.",
          },
          "Couldn't read your collections. Try again in a moment.",
        )}
      </p>
    );
  }

  const items = panel.data.items;
  if (items.length === 0) {
    return (
      <p className="font-serif italic text-ink-soft">
        No collections detected in your linked wallets yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {!compact && (
        <header>
          <p className="bcc-mono text-safety">YOUR COLLECTIONS //</p>
          <p className="mt-1 max-w-prose font-serif text-ink-soft">
            These came from your linked wallets. Join the communities that
            are live, raise your hand for the ones that aren&rsquo;t, and
            flag anything that was airdropped junk.
          </p>
        </header>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={`${item.chain_id}|${item.contract_address}`}>
            <StanceRow item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// StanceRow — one collection: art, name, state-dependent button pair.
// ─────────────────────────────────────────────────────────────────────

function StanceRow({ item }: { item: CollectionStancePanelItem }) {
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  const join = useJoinHolderGroupMutation({
    onSuccess: () => setJoined(true),
  });
  const setStance = useSetCollectionStance();
  const clearStance = useClearCollectionStance();

  const identity = {
    chain_id: item.chain_id,
    contract_address: item.contract_address,
  };
  const busy = join.isPending || setStance.isPending || clearStance.isPending;
  const onWaitlist = item.viewer_stance === "waitlist";
  const flaggedSpam = item.viewer_stance === "spam";
  const displayName = (item.name ?? "").trim() || shortContract(item.contract_address);

  const run = (action: () => Promise<unknown>): void => {
    setError(null);
    void action().catch((err: unknown) => setError(humanizeStanceError(err)));
  };

  return (
    <div
      className="flex items-center gap-3 border-2 px-3 py-2"
      style={{
        borderColor: flaggedSpam ? "rgb(var(--bcc-flag-rgb) / 0.5)" : "rgb(var(--ink-rgb) / 0.18)",
        background: "var(--paper)",
        opacity: flaggedSpam ? 0.75 : 1,
      }}
    >
      <div
        className="h-12 w-12 shrink-0 overflow-hidden bg-cardstock-deep/30"
        aria-hidden
      >
        {item.image_url !== null && item.image_url !== "" && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            style={flaggedSpam ? { filter: "saturate(0.3)" } : undefined}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="bcc-stencil truncate text-ink" style={{ fontSize: "14px" }}>
          {displayName}
        </p>
        <p
          className="bcc-mono text-ink-ghost"
          style={{ fontSize: "9px", letterSpacing: "0.16em" }}
        >
          {item.state === "live"
            ? "COMMUNITY LIVE"
            : item.waitlist_count > 0
              ? `${item.waitlist_count} ON THE WAITLIST`
              : "COMMUNITY NOT YET ACTIVATED"}
        </p>
        {error !== null && (
          <p role="alert" className="bcc-mono mt-1 text-safety" style={{ fontSize: "10px" }}>
            {error}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        {item.state === "live" && item.group_id !== null ? (
          joined ? (
            <span
              className="bcc-stencil px-3 py-1.5 text-[11px] tracking-[0.16em]"
              style={{ background: "var(--verified)", color: "var(--cardstock)" }}
            >
              ✓ JOINED
            </span>
          ) : (
            <button
              type="button"
              onClick={() => run(() => join.mutateAsync(item.group_id as number))}
              disabled={busy || flaggedSpam}
              className="bcc-stencil border-2 border-ink px-3 py-1.5 text-[11px] tracking-[0.16em] text-ink transition hover:bg-ink hover:text-cardstock disabled:opacity-50 motion-reduce:transition-none"
            >
              {join.isPending ? "JOINING…" : "JOIN THIS COMMUNITY →"}
            </button>
          )
        ) : (
          <button
            type="button"
            aria-pressed={onWaitlist}
            onClick={() =>
              run(() =>
                onWaitlist
                  ? clearStance.mutateAsync(identity)
                  : setStance.mutateAsync({ ...identity, stance: "waitlist" }),
              )
            }
            disabled={busy || flaggedSpam}
            className="bcc-stencil border-2 px-3 py-1.5 text-[11px] tracking-[0.16em] transition disabled:opacity-50 motion-reduce:transition-none"
            style={
              onWaitlist
                ? { borderColor: "var(--blueprint)", background: "var(--blueprint)", color: "var(--cardstock)" }
                : { borderColor: "var(--ink)", color: "var(--ink)" }
            }
          >
            {setStance.isPending || clearStance.isPending
              ? "SAVING…"
              : onWaitlist
                ? "✓ ON THE WAITLIST"
                : "JOIN THE WAITLIST"}
          </button>
        )}

        <button
          type="button"
          aria-pressed={flaggedSpam}
          onClick={() =>
            run(() =>
              flaggedSpam
                ? clearStance.mutateAsync(identity)
                : setStance.mutateAsync({ ...identity, stance: "spam" }),
            )
          }
          disabled={busy}
          className="bcc-mono text-[10px] tracking-[0.14em] underline-offset-2 transition hover:underline disabled:opacity-50 motion-reduce:transition-none"
          style={{ color: flaggedSpam ? "var(--bcc-flag)" : "var(--ink-soft)" }}
        >
          {flaggedSpam ? "⚑ REPORTED AS SPAM — UNDO" : "REPORT AS SPAM"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function shortContract(contract: string): string {
  return contract.length > 16
    ? `${contract.slice(0, 10)}…${contract.slice(-4)}`
    : contract;
}

function humanizeStanceError(err: unknown): string {
  // Phase γ doctrine — branch on err.code only.
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in to make this call.",
      bcc_nft_not_owned: "Your linked wallets don't hold this collection anymore.",
      bcc_unavailable: "Couldn't verify your holdings right now. Try again shortly.",
      bcc_rate_limited: "Easy on the clicks — give it a beat and try again.",
      bcc_permission_denied: "You can't join this community right now.",
    },
    "Couldn't save that. Try again.",
  );
}
