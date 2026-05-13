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

import { type MouseEvent, useEffect, useRef, useState } from "react";

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
  // `Stake my rep` was retired 2026-05-13 (Phase γ UX cleanup): `stake`
  // is a token-finance verb in crypto-native contexts. The reaction
  // here is reputational, not financial — the new helper makes that
  // explicit without losing the commitment escalation.
  { kind: "stand_behind", brand: "Stand behind", helper: "Put your name on it" },
];

function TrustRail({ item }: { item: FeedItem }) {
  const { handleClick, isPending } = useReactionClick(item);
  const viewerReaction = item.reactions.viewer_reaction;
  const counts         = item.reactions.counts;

  return (
    <div className="flex flex-col gap-1.5">
      {/* Seam-copy (Phase γ UX cleanup): the trust rail looks identical
          to the social rail at first glance but its buttons are
          reputationally weighted — clicks stake your name, not just
          your mood. A single-line caption named once on first
          encounter beats explaining it in every tooltip. The hint is
          dismissible via sessionStorage; once acknowledged it never
          renders again for this session. See TrustRailHint below. */}
      <TrustRailHint />
      <div className="flex flex-wrap items-center gap-2">
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
            {/* Helper copy hidden at <md so the trust pills fit at 320px
                without crowding the count and footer actions. The brand
                + count alone communicate the action; the helper exists
                for first-time-user clarity on desktop. */}
            <span className="hidden md:inline text-ink-soft/70 italic">{helper}</span>
            {count > 0 && (
              <span className={isActive ? "text-ink" : "text-ink-soft/80"}>
                {count}
              </span>
            )}
          </button>
        );
      })}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TrustRailHint — one-line first-encounter caption above the trust rail.
//
// Phase γ UX cleanup found the trust grammar (Solid / Vouch / Stand behind)
// silently swaps in over the social grammar (Like / Love / Haha / Wow /
// Fire) based on `post_kind`. The seam is invisible; users tap what
// looks like a social reaction and instead stake their reputation.
//
// Mitigation: a single sentence rendered once per session above the
// first trust rail the viewer encounters. Sessionstorage-gated so it
// doesn't follow them around the feed. Reduced-motion respected by
// having no animation at all — it just renders or doesn't.
//
// On-purpose constraints:
//   - No close button; clicking the rail dismisses it implicitly.
//   - sessionStorage write is try/catched (Safari private mode, etc.);
//     a failed write means the hint shows on the next post too, which
//     is acceptable.
//   - Anonymous viewers see it the same way; sessionStorage scope
//     covers them fine.
// ─────────────────────────────────────────────────────────────────────

const TRUST_RAIL_HINT_KEY = "bcc.trust_rail_hint_seen";

function TrustRailHint() {
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.sessionStorage.getItem(TRUST_RAIL_HINT_KEY) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(TRUST_RAIL_HINT_KEY, "1");
    } catch {
      // Safari private mode etc. — non-fatal; hint will reappear.
    }
  };

  return (
    <p
      className="bcc-mono text-[10px] tracking-[0.16em] text-ink-soft/70"
      onClick={dismiss}
    >
      TRUST SIGNAL · CLICKS HERE PUT YOUR NAME ON IT.
    </p>
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
    <div className="flex flex-wrap items-center gap-1">
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
              //
              // Sprint 2 constitutional revision: hover-scale removed.
              // Hover-scale primes the hand the way generic-social apps
              // do — it solicits the click before the operator has
              // committed. Active-scale on click stays (it's
              // user-initiated feedback for a deliberate action, not
              // solicitation). The hover background change is the
              // ambient acknowledgment.
              "inline-flex min-h-[36px] items-center gap-1 rounded-full px-2.5 py-1 text-sm transition disabled:cursor-not-allowed motion-safe:active:scale-95 " +
              (isActive
                ? "bg-cardstock text-ink ring-1 ring-safety/50"
                : "text-ink-soft hover:bg-cardstock/60 hover:text-ink")
            }
          >
            <span className="text-base leading-none">{emoji}</span>
            {count > 0 && <ReactionCount count={count} />}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ReactionCount — renders the count chip and runs the bcc-count-bump
// keyframe (globals.css) when the value ticks UP. Removals don't
// celebrate.
//
// The component is conditionally mounted only when `count > 0`, so
// "first reaction" (0 → 1) is a fresh mount. Initializing prevRef to
// `count - 1` makes that first mount register as an increment and fire
// the bump — which is the user's most meaningful click on this post,
// the one most worth confirming. Subsequent in-place increments
// (1 → 2 → 3) compare against the prior render's value normally.
//
// `key={count}` forces the inner span to remount on every change,
// which is the most reliable way to re-trigger a one-shot CSS
// animation. The motion-safe: prefix keeps it off entirely on
// reduced-motion systems (the global override at globals.css:115
// would also neutralize the animation, but the prefix avoids
// painting the class at all).
// ─────────────────────────────────────────────────────────────────────

function ReactionCount({ count }: { count: number }) {
  const prevRef = useRef<number>(count - 1);
  const [shouldBump, setShouldBump] = useState(false);

  useEffect(() => {
    if (count > prevRef.current) {
      setShouldBump(true);
    } else {
      setShouldBump(false);
    }
    prevRef.current = count;
  }, [count]);

  return (
    <span
      key={count}
      className={
        "bcc-mono text-[10px] text-ink-soft/80 inline-block " +
        (shouldBump
          ? "motion-safe:animate-[bcc-count-bump_280ms_ease-out]"
          : "")
      }
    >
      {count}
    </span>
  );
}
