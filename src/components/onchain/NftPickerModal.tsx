"use client";

/**
 * NftPickerModal — the brutalist NFT picker (§ Phase 2 picker UI).
 *
 * Shows a grid of NFTs the user owns across their connected wallets,
 * pulled from GET /bcc/v1/nft-selections/picker. Each tile is a toggle:
 *   - unselected → click → POST /nft-selections (add to showcase)
 *   - selected   → click → DELETE /nft-selections (remove from showcase)
 *
 * Mutations invalidate both the picker query (so this modal flips the
 * checkmark instantly) and the saved-selections list query (so the
 * profile strip stays in sync). Per-tile pending state is keyed on the
 * (chain, contract, token) identity tuple so two simultaneous toggles
 * don't lock each other out.
 *
 * Visual: hi-vis safety-orange outline + ✓ stencil corner stamp on
 * selected tiles, faint cardstock-edge border on unselected. Brutalist
 * grid — sharp corners, dashed dividers, mono labels.
 *
 * The "REFRESH HOLDINGS" button bypasses the HoldingsService transient
 * (via GET ?force=1) and seeds the same cached query slot the modal is
 * reading, so the refetch propagates without remounting the query.
 *
 * The "SYNCED Xm ago" line is the most-recent wallet refresh across
 * any chain — backend ships per-wallet timestamps (refreshed_at keyed
 * by wallet_link_id), not per-chain, so we report the global maximum
 * rather than inventing a chain-id → slug aggregation client-side.
 *
 * Out of v1: drag-to-reorder (POST /reorder), per-chain filter chips.
 * The modal closes via the ESC button or backdrop click; selections
 * persist as soon as the mutation lands.
 */

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import {
  NFT_PICKER_QUERY_KEY_ROOT,
  NFT_SELECTIONS_QUERY_KEY_ROOT,
  useDeleteNftSelection,
  useNftPicker,
  useSaveNftSelection,
} from "@/hooks/useNftSelections";
import { humanizeCode } from "@/lib/api/errors";
import { getNftPicker } from "@/lib/api/nft-selections-endpoints";
import {
  BccApiError,
  type NftPickerItem,
} from "@/lib/api/types";
import { formatRelativeTime } from "@/lib/format";

import { IndexerStateChip } from "./IndexerStateChip";

interface NftPickerModalProps {
  onClose: () => void;
}

export function NftPickerModal({ onClose }: NftPickerModalProps) {
  const queryClient = useQueryClient();
  const picker = useNftPicker();
  const save = useSaveNftSelection();
  const remove = useDeleteNftSelection();

  // Tracks which tile is mid-mutation by (chain|contract|token) key.
  // Keyed instead of boolean so a second click doesn't double-toggle.
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const invalidateAll = (): void => {
    void queryClient.invalidateQueries({ queryKey: NFT_PICKER_QUERY_KEY_ROOT });
    void queryClient.invalidateQueries({ queryKey: NFT_SELECTIONS_QUERY_KEY_ROOT });
  };

  const handleRefresh = async (): Promise<void> => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const fresh = await getNftPicker({ force: true });
      // Seed the SAME cache slot the modal is reading from. The "force"
      // and "cached" keys are independent queries; setQueryData on the
      // cached slot makes the new payload visible without remounting.
      queryClient.setQueryData(
        [...NFT_PICKER_QUERY_KEY_ROOT, "cached"],
        fresh,
      );
    } catch (err) {
      setErrorMessage(humanizeRefreshError(err));
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleToggle = async (item: NftPickerItem): Promise<void> => {
    const key = itemKey(item);
    if (pendingKey !== null) return;
    setPendingKey(key);
    setErrorMessage(null);

    const identity = {
      chain_id: item.chain_id,
      contract_address: item.contract_address,
      token_id: item.token_id,
    };

    try {
      if (item.is_selected) {
        await remove.mutateAsync(identity);
      } else {
        await save.mutateAsync(identity);
      }
      invalidateAll();
    } catch (err) {
      setErrorMessage(humanizeError(err));
    } finally {
      setPendingKey(null);
    }
  };

  return (
    <ModalShell onClose={onClose} title="Pick the NFTs to showcase">
      <header className="mb-5">
        <p className="bcc-mono text-safety">SHOWCASE //</p>
        <h2 className="bcc-stencil mt-1 text-3xl text-ink leading-[0.95]">
          Pick your NFTs.
        </h2>
        <p className="mt-2 max-w-prose font-serif text-ink-soft">
          Anything from a wallet you&rsquo;ve linked is fair game. Tap a
          tile to add it; tap again to take it out. Your showcase updates
          the moment each tile flips.
        </p>
      </header>

      {picker.isPending && (
        <p className="bcc-mono text-cardstock-deep">Loading holdings…</p>
      )}

      {picker.isError && (
        <p role="alert" className="bcc-mono text-safety">
          Couldn&rsquo;t load your holdings: {picker.error.message}
        </p>
      )}

      {picker.isSuccess && (
        <>
          {picker.data.items.length === 0 ? (
            <NftPickerEmpty />
          ) : (
            <>
              {picker.data.truncated && (
                <p
                  className="bcc-mono mb-4 border border-weld/60 bg-weld/10 px-3 py-2 text-ink"
                  style={{ fontSize: "10px", letterSpacing: "0.18em" }}
                >
                  PARTIAL LIST &middot; SOME WALLETS WERE TRUNCATED FOR THIS
                  PASS
                </p>
              )}

              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {picker.data.items.map((item) => {
                  const key = itemKey(item);
                  return (
                    <li key={key}>
                      <NftTile
                        item={item}
                        pending={pendingKey === key}
                        disabled={pendingKey !== null && pendingKey !== key}
                        onToggle={() => {
                          void handleToggle(item);
                        }}
                      />
                    </li>
                  );
                })}
              </ul>

              <SyncStatusBlock data={picker.data} />
            </>
          )}
        </>
      )}

      {errorMessage !== null && (
        <p
          role="alert"
          className="bcc-mono mt-4 border-l-2 border-safety pl-3 text-safety"
        >
          {errorMessage}
        </p>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ink/20 pt-4">
        <button
          type="button"
          onClick={() => {
            void handleRefresh();
          }}
          disabled={isRefreshing || picker.isPending}
          className="bcc-mono border border-ink/40 px-3 py-2 text-[11px] tracking-[0.18em] text-ink transition hover:bg-ink/10 disabled:cursor-wait disabled:opacity-50 motion-reduce:transition-none"
        >
          {isRefreshing ? "REFRESHING…" : "REFRESH HOLDINGS →"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="bcc-stencil bg-ink px-5 py-2.5 text-[12px] tracking-[0.2em] text-cardstock transition hover:bg-blueprint motion-reduce:transition-none"
        >
          DONE
        </button>
      </div>
    </ModalShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SyncStatusBlock — per-chain indexer chips + a global "SYNCED N ago"
// footer. Renders only if at least one chip or a refresh timestamp is
// present; otherwise emits nothing so the empty state stays clean.
//
// Why global, not per-chain: backend ships `refreshed_at` keyed by
// wallet_link_id, while indexer_state_label is keyed by chain_slug.
// Mapping wallets → chains would require a chain_id → chain_slug
// bridge the response doesn't ship, which crosses into FE business
// logic. The max-across-wallets reading is honest about the data.
// ─────────────────────────────────────────────────────────────────────

function SyncStatusBlock({
  data,
}: {
  data: {
    refreshed_at: Record<string, string>;
    meta: {
      indexer_state: Record<string, string>;
      indexer_state_label: Record<string, string>;
    };
  };
}) {
  const chipsPresent = Object.values(data.meta.indexer_state_label).some(
    (label) => label !== "",
  );
  const latestRefresh = pickLatestRefresh(data.refreshed_at);
  if (!chipsPresent && latestRefresh === "") return null;

  const syncedAgo = latestRefresh !== "" ? formatRelativeTime(latestRefresh) : "";

  return (
    <div className="mt-5 flex flex-col gap-2 border-t border-dashed border-ink/20 pt-4">
      {chipsPresent && (
        <ul className="flex flex-col gap-1">
          {Object.entries(data.meta.indexer_state_label).map(
            ([chain, label]) =>
              label === "" ? null : (
                <li key={chain}>
                  <IndexerStateChip
                    chain={chain}
                    state={data.meta.indexer_state[chain] ?? ""}
                    label={label}
                  />
                </li>
              ),
          )}
        </ul>
      )}
      {syncedAgo !== "" && (
        <p
          className="bcc-mono text-ink-ghost"
          style={{ fontSize: "10px", letterSpacing: "0.18em" }}
        >
          SYNCED {syncedAgo.toUpperCase()} AGO
        </p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// NftTile — one selectable holdings item. Toggle button with the
// "selected" state expressed via a hi-vis ring + stencil corner stamp.
// ─────────────────────────────────────────────────────────────────────

function NftTile({
  item,
  pending,
  disabled,
  onToggle,
}: {
  item: NftPickerItem;
  pending: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const selected = item.is_selected;
  const displayName = (item.name ?? "").trim();
  const collection = (item.collection_name ?? "").trim();
  const fallbackTitle =
    displayName !== ""
      ? displayName
      : collection !== ""
        ? collection
        : `Token #${item.token_id}`;

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      aria-label={`${selected ? "Remove" : "Add"} ${fallbackTitle} ${selected ? "from" : "to"} your showcase`}
      onClick={onToggle}
      disabled={disabled || pending}
      className="group relative block w-full overflow-hidden border-2 text-left transition motion-reduce:transition-none"
      style={{
        borderColor: selected ? "var(--safety)" : "rgba(15,13,9,0.18)",
        background: "var(--paper)",
        opacity: disabled ? 0.5 : 1,
        cursor: disabled || pending ? "wait" : "pointer",
      }}
    >
      <div
        className="relative aspect-square w-full bg-cardstock-deep/30"
        aria-hidden
      >
        {item.image_url !== null && item.image_url !== undefined && item.image_url !== "" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span
              className="bcc-stencil text-3xl"
              style={{ color: "var(--cardstock-deep)" }}
            >
              №{item.token_id.length > 4 ? item.token_id.slice(0, 4) : item.token_id}
            </span>
          </div>
        )}

        {selected && (
          <span
            aria-hidden
            className="bcc-stencil absolute right-2 top-2 px-2 py-0.5 text-[12px] tracking-[0.18em]"
            style={{
              background: "var(--safety)",
              color: "var(--cardstock)",
            }}
          >
            ✓ ON FLOOR
          </span>
        )}

        {pending && (
          <span
            aria-hidden
            className="bcc-mono absolute inset-0 flex items-center justify-center text-cardstock"
            style={{
              background: "rgba(15,13,9,0.55)",
              fontSize: "10px",
              letterSpacing: "0.22em",
            }}
          >
            {selected ? "REMOVING…" : "ADDING…"}
          </span>
        )}
      </div>

      <div className="border-t border-ink/10 px-3 py-2">
        <p
          className="bcc-stencil text-ink"
          style={{
            fontSize: "13px",
            lineHeight: 1.1,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {fallbackTitle}
        </p>
        <p
          className="bcc-mono mt-1 text-ink-ghost"
          style={{ fontSize: "9px", letterSpacing: "0.18em" }}
        >
          {collection !== "" && collection !== fallbackTitle
            ? `${collection.toUpperCase()} · `
            : ""}
          CHAIN {item.chain_id}
        </p>
      </div>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// NftPickerEmpty — the "you have no holdings" branch. Most users land
// here on first open if they haven't connected a wallet yet, or if
// their wallets hold no NFTs the indexers can see.
// ─────────────────────────────────────────────────────────────────────

function NftPickerEmpty() {
  return (
    <div className="border-2 border-dashed border-ink/30 p-6 text-center">
      <p className="bcc-mono text-safety">NOTHING ON THE FLOOR</p>
      <p className="bcc-stencil mt-2 text-2xl text-ink">
        No holdings detected.
      </p>
      <p
        className="mx-auto mt-3 max-w-md font-serif italic text-ink-soft"
        style={{ fontSize: "14px", lineHeight: 1.55 }}
      >
        Either no wallet is linked yet or the chains haven&rsquo;t
        finished indexing. Link a wallet first; reopen the picker after
        a few seconds.
      </p>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/settings/account"
          className="bcc-stencil border-2 border-ink px-4 py-2 text-[11px] tracking-[0.2em] text-ink transition hover:bg-ink hover:text-cardstock motion-reduce:transition-none"
        >
          LINK A WALLET →
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ModalShell — same idiom as PanelVoteModal / OpenDisputeModal so the
// modal stack on this app reads consistently. ESC button in the corner;
// click-outside also closes via the backdrop.
// ─────────────────────────────────────────────────────────────────────

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/70 p-4 backdrop-blur-sm md:items-center"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bcc-panel relative max-h-[92vh] w-full max-w-3xl overflow-y-auto p-6 md:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="bcc-mono absolute right-4 top-4 text-cardstock-deep hover:text-ink"
        >
          ESC
        </button>
        {children}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Helpers — local to this surface.
// ─────────────────────────────────────────────────────────────────────

function itemKey(item: NftPickerItem): string {
  return `${item.chain_id}|${item.contract_address}|${item.token_id}`.toLowerCase();
}

function humanizeError(err: unknown): string {
  // Phase γ doctrine: branch on `err.code`, not `err.status`.
  //
  // KNOWN BACKEND-CONTRACT DEBT (tracked):
  //   The NftSelectionController at
  //     app/public/wp-content/plugins/bcc-trust/app/Domain/Onchain/Controllers/NftSelectionController.php
  //   currently emits NON-canonical envelopes for some failure paths
  //   (lines 90-91, 111-112, 130-135, 146-147, 162-163). When that
  //   controller is migrated to the canonical envelope + stable codes
  //   (`bcc_nft_not_owned` for 403, `bcc_rate_limited` for 429,
  //   `bcc_invalid_request` for 400), the status-branching fallback
  //   below collapses into a pure code map.
  //
  // Until then, the `status` branches are deliberate temporary
  // compatibility shims, NOT a violation of Phase γ doctrine. They are
  // contract-fragile by acknowledgment: a server change to the legacy
  // status/payload would silently break this UI. The fix is on the
  // server side, not here.
  if (err instanceof BccApiError) {
    if (err.code === "bcc_nft_not_owned" || err.status === 403) {
      return "That NFT isn't in your linked wallets right now. Try the wallet picker first.";
    }
    if (err.code === "bcc_rate_limited" || err.status === 429) {
      return "Easy on the clicks — give it a beat and try again.";
    }
  }
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in to update your showcase.",
      bcc_invalid_request: "Couldn't update your showcase. Check your selections.",
    },
    "Couldn't update your showcase. Try again.",
  );
}

function humanizeRefreshError(err: unknown): string {
  // Same Phase γ doctrine as humanizeError above, but the copy is
  // refresh-flavored. The picker GET shares the 10/60 throttle bucket,
  // so 429 is the most likely user-visible failure here.
  if (err instanceof BccApiError) {
    if (err.code === "bcc_rate_limited" || err.status === 429) {
      return "Cooling off — give the indexers a beat and try again.";
    }
  }
  return humanizeCode(
    err,
    {
      bcc_unauthorized: "Sign in to refresh your holdings.",
    },
    "Couldn't refresh holdings. Try again.",
  );
}

/**
 * Pick the most-recent timestamp from `refreshed_at` (keyed by
 * wallet_link_id). Returns "" if the dict is empty.
 *
 * Lexical max is correct ONLY because the backend currently emits a
 * single format (zero-padded MySQL UTC `YYYY-MM-DD HH:MM:SS`) per
 * `current_time('mysql', true)`. Within that format, lexical and
 * chronological order agree. If the backend ever mixes ISO 8601 and
 * MySQL in the same dict, ISO would sort greater than MySQL for the
 * same instant (`T` > ` `), so the comparison would prefer ISO rows
 * regardless of recency. Normalize at the boundary in that case.
 */
function pickLatestRefresh(refreshedAt: Record<string, string>): string {
  let latest = "";
  for (const ts of Object.values(refreshedAt)) {
    if (ts > latest) latest = ts;
  }
  return latest;
}
