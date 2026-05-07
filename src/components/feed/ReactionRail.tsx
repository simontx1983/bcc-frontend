"use client";

/**
 * ReactionRail — grammar-aware reaction rail.
 *
 * v1.5 layered model (api-contract-v1.md §2.11): the rail branches
 * on `item.reactions.kind_grammar`. Two grammars render today:
 *
 *   - trust  — restrained, intentional. Solid / Vouch / Stand-behind.
 *              Carries the §N1 dual-label (brand + plain-English
 *              helper). Visually quiet — closer to "signing your
 *              name" than "smashing Like."
 *
 *   - social — expressive, emoji-forward. Like / Love / Haha / Wow /
 *              Fire. Light hover/active scale, count chips fade on
 *              when the count is non-zero. Reduced-motion respected
 *              via `motion-safe:` variants.
 *
 *   - tribal — reserved for V2 (same_wallet, onchain_confirm, etc.).
 *              Currently renders nothing; the discriminator exists so
 *              the layered model is forward-compatible.
 *
 * Every reaction kind across all grammars writes to the same backing
 * table (peepso_reactions); the discriminator only changes which
 * kinds the rail surfaces. Per §A2, this component reads
 * `kind_grammar` from the server view-model — never derives it from
 * `post_kind` client-side.
 *
 * Behaviour (both rails):
 *   - Click an idle button → set that reaction (POST /reactions).
 *   - Click your active reaction → remove it (DELETE /reactions/:id).
 *   - Click a different button while another is active → swap.
 *     Server's set endpoint is idempotent on swap; the optimistic
 *     update flips counts in one cache mutation.
 */

import { type MouseEvent } from "react";

import {
  useRemoveReactionMutation,
  useSetReactionMutation,
} from "@/hooks/useReactions";
import type {
  FeedItem,
  ReactionKind,
  SocialReactionKind,
  TrustReactionKind,
} from "@/lib/api/types";

export function ReactionRail({ item }: { item: FeedItem }) {
  const grammar = item.reactions.kind_grammar;

  if (grammar === "trust") {
    return <TrustRail item={item} />;
  }
  if (grammar === "social") {
    return <SocialRail item={item} />;
  }
  // tribal — reserved for V2; render nothing until kinds ship.
  return null;
}

// ─────────────────────────────────────────────────────────────────────
// Shared click-handler hook — both rails use this.
//
// Keeps the click semantics in one place so the trust + social rails
// can never drift on idempotency, swap, or pending-state behaviour.
// ─────────────────────────────────────────────────────────────────────

function useReactionClick(item: FeedItem) {
  const setMut    = useSetReactionMutation();
  const removeMut = useRemoveReactionMutation();
  const isPending = setMut.isPending || removeMut.isPending;

  const handleClick =
    (kind: ReactionKind) => (event: MouseEvent<HTMLButtonElement>) => {
      // Stop propagation in case the rail ends up inside a future
      // clickable container (e.g. card-body click navigation).
      event.stopPropagation();
      if (isPending) return;

      if (item.reactions.viewer_reaction === kind) {
        removeMut.mutate(item.id);
      } else {
        setMut.mutate({ feed_id: item.id, reaction: kind });
      }
    };

  return { handleClick, isPending };
}

// ─────────────────────────────────────────────────────────────────────
// Trust rail — §D5 / §N1, restrained.
// ─────────────────────────────────────────────────────────────────────

interface TrustReactionDef {
  kind: TrustReactionKind;
  brand: string;
  helper: string;
}

const TRUST_REACTIONS: ReadonlyArray<TrustReactionDef> = [
  { kind: "solid",        brand: "Solid",        helper: "Agree" },
  { kind: "vouch",        brand: "Vouch",        helper: "Back this" },
  { kind: "stand_behind", brand: "Stand behind", helper: "Stake my rep" },
];

function TrustRail({ item }: { item: FeedItem }) {
  const { handleClick, isPending } = useReactionClick(item);
  const viewerReaction = item.reactions.viewer_reaction;
  const counts         = item.reactions.counts;

  return (
    <div className="flex items-center gap-2">
      {TRUST_REACTIONS.map(({ kind, brand, helper }) => {
        const count    = counts[kind] ?? 0;
        const isActive = viewerReaction === kind;
        return (
          <button
            key={kind}
            type="button"
            onClick={handleClick(kind)}
            disabled={isPending}
            aria-pressed={isActive}
            title={`${brand} — ${helper}`}
            className={
              // Touch target: min-h-[36px] hits the practical phone
              // tap floor without making desktop feel chunky. Helpers
              // ride visible at all widths until §N1 familiarity gates
              // them off (the view-model doesn't yet expose the flag).
              // Intentionally *no* hover-scale or other dopamine
              // animation — the trust rail's job is to feel
              // deliberate, not engagement-bait.
              "bcc-mono inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] transition disabled:cursor-not-allowed " +
              (isActive
                ? "border-safety bg-safety/10 text-ink"
                : "border-cardstock-edge/40 bg-cardstock text-ink-soft hover:border-cardstock-edge hover:text-ink")
            }
          >
            <span className="font-medium">{brand}</span>
            <span className="text-ink-soft/70 italic">{helper}</span>
            {count > 0 && (
              <span className={isActive ? "text-ink" : "text-ink-soft/80"}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Social rail — v1.5 culture-formation grammar, expressive.
// ─────────────────────────────────────────────────────────────────────

interface SocialReactionDef {
  kind: SocialReactionKind;
  emoji: string;
  label: string;
}

const SOCIAL_REACTIONS: ReadonlyArray<SocialReactionDef> = [
  { kind: "like", emoji: "👍", label: "Like" },
  { kind: "love", emoji: "❤️", label: "Love" },
  { kind: "haha", emoji: "😂", label: "Haha" },
  { kind: "wow",  emoji: "😮", label: "Wow"  },
  { kind: "fire", emoji: "🔥", label: "Fire" },
];

function SocialRail({ item }: { item: FeedItem }) {
  const { handleClick, isPending } = useReactionClick(item);
  const viewerReaction = item.reactions.viewer_reaction;
  const counts         = item.reactions.counts;

  return (
    <div className="flex items-center gap-1">
      {SOCIAL_REACTIONS.map(({ kind, emoji, label }) => {
        const count    = counts[kind] ?? 0;
        const isActive = viewerReaction === kind;
        return (
          <button
            key={kind}
            type="button"
            onClick={handleClick(kind)}
            disabled={isPending}
            aria-pressed={isActive}
            aria-label={label}
            title={label}
            className={
              // Emoji-forward, narrower padding — fits 5 reactions in
              // the same horizontal space the trust rail uses for 3.
              // motion-safe:* variants honor reduced-motion users; on
              // those systems the buttons stay still and rely on
              // background change for active-state feedback.
              "inline-flex min-h-[36px] items-center gap-1 rounded-full px-2.5 py-1 text-sm transition disabled:cursor-not-allowed motion-safe:hover:scale-110 motion-safe:active:scale-95 " +
              (isActive
                ? "bg-cardstock text-ink ring-1 ring-safety/50"
                : "text-ink-soft hover:bg-cardstock/60 hover:text-ink")
            }
          >
            <span className="text-base leading-none">{emoji}</span>
            {count > 0 && (
              <span className="bcc-mono text-[10px] text-ink-soft/80">
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
