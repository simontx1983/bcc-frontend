"use client";

/**
 * OnboardingWizard — the post-signup setup surface.
 *
 * Three steps, per the §B4 plan + §O1 dopamine moment:
 *
 *   1. "chain"    — pick a home chain (skippable). Stores the choice
 *                   locally; persisted to wp_usermeta.bcc_home_chain on
 *                   the final POST /me/onboarding/complete call.
 *   2. "pulls"    — first-pull suggestions. Each Pull commits immediately
 *                   to the binder via POST /me/binder/pull (real
 *                   mutation; server's batch aggregator decides when
 *                   those become a feed item per §C3).
 *   3. "dopamine" — the §O1 send-off. Cards fly into a binder icon with
 *                   rarity-tinted glow trails, a stat-pop appears, the
 *                   cream cardstock backdrop fades to concrete floor.
 *                   Mutation fires in parallel; once both the
 *                   animation has played its minimum hold AND the
 *                   server has flipped the onboarded flag, we route
 *                   the user to /. `prefers-reduced-motion` users see
 *                   a still confirmation tile and route immediately
 *                   after the mutation settles.
 *
 * Sticky 3-bullet explainer strip rides above steps 1 + 2 — no
 * separate welcome screen. Disappears for the dopamine step so the
 * full-bleed animation can take over.
 *
 * Per-card pending state during step 2: tracked in a local Set so
 * concurrent clicks on different cards work; the click-through is
 * gated when pending.
 */

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { CardFactory } from "@/components/cards/CardFactory";
import { useBinder } from "@/hooks/useBinder";
import { useCompleteOnboarding } from "@/hooks/useCompleteOnboarding";
import { useOnboardingSuggestions } from "@/hooks/useOnboardingSuggestions";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { usePullMutation, useUnpullMutation } from "@/hooks/useBinderPull";
import type {
  Card,
  CardTier,
  HomeChain,
  OnboardingSuggestions,
} from "@/lib/api/types";

// ─────────────────────────────────────────────────────────────────────
// Step machine
// ─────────────────────────────────────────────────────────────────────

type Step = "chain" | "pulls" | "dopamine";

export interface OnboardingWizardProps {
  handle: string;
}

export function OnboardingWizard({ handle }: OnboardingWizardProps) {
  const [step, setStep] = useState<Step>("chain");
  const [homeChain, setHomeChain] = useState<HomeChain | null>(null);
  const pulls = useWizardPulls();

  const wizardLabel: Record<Step, string> = {
    chain:    "Step 1 of 3 · Home Chain",
    pulls:    "Step 2 of 3 · First Pulls",
    dopamine: "Step 3 of 3 · Welcome",
  };

  return (
    <main className="min-h-screen pb-24">
      <header className="bcc-rail">
        <span>
          <span className="bcc-rail-dot" />
          BCC // Onboarding · {wizardLabel[step]}
        </span>
        <span className="bcc-mono text-cardstock-deep">@{handle}</span>
      </header>

      {step !== "dopamine" && <ExplainerStrip />}

      {step === "chain" && (
        <HomeChainStep
          selected={homeChain}
          onSelect={setHomeChain}
          onContinue={() => setStep("pulls")}
        />
      )}

      {step === "pulls" && (
        <FirstPullsStep
          pulls={pulls}
          onBack={() => setStep("chain")}
          onDone={() => setStep("dopamine")}
        />
      )}

      {step === "dopamine" && (
        <DopamineStep
          homeChain={homeChain}
          pulledCards={pulls.snapshot()}
        />
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ExplainerStrip — 3-bullet "how the Floor works" sticky header.
// Rides above steps 1 + 2 per §B4. Always visible (no familiarity
// drop-off here — onboarding is the first encounter, by definition).
// ─────────────────────────────────────────────────────────────────────

function ExplainerStrip() {
  return (
    <div
      className="sticky top-0 z-10 border-b border-cardstock-edge/30 bg-cardstock/95 backdrop-blur"
      role="region"
      aria-label="How the Floor works"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-2 px-8 py-3">
        <ExplainerBullet n="1" title="Pull cards">
          Follow validators, projects, and creators you trust.
        </ExplainerBullet>
        <ExplainerBullet n="2" title="Earn rank">
          Review, vouch, and post to climb from Apprentice up.
        </ExplainerBullet>
        <ExplainerBullet n="3" title="Sign on-chain">
          Link a wallet to dispute, claim, and stake your rep.
        </ExplainerBullet>
      </div>
    </div>
  );
}

function ExplainerBullet({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-baseline gap-2 text-sm">
      <span className="bcc-mono shrink-0 rounded-sm bg-ink px-1.5 py-0.5 text-[10px] text-cardstock">
        {n}
      </span>
      <span className="bcc-stencil text-ink">{title}</span>
      <span className="font-serif text-ink-soft">— {children}</span>
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HomeChainStep — pick one of 5. Skippable. The choice is held in
// parent state and posted on the final /complete call (per §B4 +
// the OnboardingEndpoint's home_chain field).
// ─────────────────────────────────────────────────────────────────────

interface ChainOption {
  id: HomeChain;
  label: string;
  blurb: string;
}

const CHAIN_OPTIONS: ReadonlyArray<ChainOption> = [
  { id: "cosmos",    label: "Cosmos",    blurb: "Hub + IBC ecosystem" },
  { id: "osmosis",   label: "Osmosis",   blurb: "DEX + appchain hub"  },
  { id: "injective", label: "Injective", blurb: "Trading + derivatives" },
  { id: "ethereum",  label: "Ethereum",  blurb: "L1 + L2 ecosystem"   },
  { id: "solana",    label: "Solana",    blurb: "High-throughput L1"  },
];

function HomeChainStep({
  selected,
  onSelect,
  onContinue,
}: {
  selected: HomeChain | null;
  onSelect: (chain: HomeChain | null) => void;
  onContinue: () => void;
}) {
  return (
    <>
      <section className="mx-auto max-w-6xl px-8 pt-12">
        <h1 className="bcc-stencil text-cardstock text-5xl md:text-6xl">
          Where do you spend most of your time?
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-xl text-cardstock-deep">
          We&apos;ll bias your suggestions and your home Local toward this chain.
          Skip if you&apos;re chain-agnostic — you can change it later.
        </p>
      </section>

      <section className="mx-auto mt-10 max-w-6xl px-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {CHAIN_OPTIONS.map((opt) => {
            const isSelected = selected === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => onSelect(isSelected ? null : opt.id)}
                aria-pressed={isSelected}
                className={
                  "bcc-panel flex flex-col items-start gap-1 px-4 py-4 text-left transition " +
                  (isSelected
                    ? "ring-2 ring-safety"
                    : "hover:border-cardstock-edge")
                }
              >
                <span className="bcc-stencil text-lg text-ink">{opt.label}</span>
                <span className="bcc-mono text-[10px] text-ink-soft">{opt.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      <footer className="mx-auto mt-12 flex max-w-6xl items-center justify-between gap-4 px-8">
        <button
          type="button"
          onClick={() => {
            onSelect(null);
            onContinue();
          }}
          className="bcc-mono text-cardstock-deep underline-offset-4 hover:underline"
        >
          Skip — chain-agnostic
        </button>

        <button
          type="button"
          onClick={onContinue}
          className="bcc-stencil flex items-center gap-3 bg-safety px-6 py-3 text-ink"
        >
          {selected !== null ? "Continue" : "Continue without one"}
        </button>
      </footer>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FirstPullsStep — Step 2. Reuses the suggestion grid + per-card pull
// state from the original wizard.
// ─────────────────────────────────────────────────────────────────────

function FirstPullsStep({
  pulls,
  onBack,
  onDone,
}: {
  pulls: WizardPullsApi;
  onBack: () => void;
  onDone: () => void;
}) {
  const suggestions = useOnboardingSuggestions();

  return (
    <>
      <section className="mx-auto max-w-6xl px-8 pt-12">
        <h1 className="bcc-stencil text-cardstock text-5xl md:text-6xl">
          Pull a few cards.
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-xl text-cardstock-deep">
          Pick the validators, projects, and creators you want to follow.
          Your binder + Floor feed start with what you pull here.
        </p>
        <p className="bcc-mono mt-3 text-cardstock-deep/70">
          Skipping is fine — you can pull cards any time.
        </p>
      </section>

      <SuggestionsBody result={suggestions} pulls={pulls} />

      <footer className="mx-auto mt-16 flex max-w-6xl items-center justify-between gap-4 px-8">
        <button
          type="button"
          onClick={onBack}
          disabled={pulls.anyPending}
          className="bcc-mono text-cardstock-deep underline-offset-4 hover:underline disabled:opacity-50"
        >
          ← Back
        </button>

        {/* Gate Done while any pull is in flight — otherwise the
            /complete mutation can race a still-flying pull and the
            server flips `onboarded` before the binder row lands. */}
        <button
          type="button"
          onClick={onDone}
          disabled={pulls.anyPending}
          aria-disabled={pulls.anyPending}
          className="bcc-stencil flex items-center gap-3 bg-safety px-6 py-3 text-ink disabled:cursor-wait disabled:opacity-60"
        >
          {pulls.anyPending
            ? "Saving pulls…"
            : pulls.pulledCount > 0
              ? `Done (${pulls.pulledCount} pulled)`
              : "Done — skip pulls"}
        </button>
      </footer>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// DopamineStep — §O1 send-off animation.
//
// On entry: fire the /complete mutation (with home_chain) AND start a
// minimum-display timer (~2.4s reduced to ~0.6s on prefers-reduced-
// motion). Once BOTH have settled, route the user to /. If the
// mutation errors, show a retry tile and skip the redirect.
//
// The animation itself is pure CSS — N abstract card chips with
// rarity-tinted glow trails fly toward a binder icon docked
// top-right; a stat-pop holds in the centre; the cardstock backdrop
// fades to a concrete-floor tone over the same window. No
// per-card DOM measurement; this is a *stylized* moment, not a
// physically-accurate flight from each rendered card.
// ─────────────────────────────────────────────────────────────────────

const MIN_HOLD_MS_FULL    = 2400;
const MIN_HOLD_MS_REDUCED = 600;

function DopamineStep({
  homeChain,
  pulledCards,
}: {
  homeChain: HomeChain | null;
  pulledCards: ReadonlyArray<{ id: number; tier: CardTier }>;
}) {
  const router = useRouter();
  const complete = useCompleteOnboarding();
  const reducedMotion = usePrefersReducedMotion();
  const [holdElapsed, setHoldElapsed] = useState(false);

  // Fire the mutation + start the hold timer once on mount. The
  // ref-guarded mutate call protects against React 19 strict-mode
  // double-invoke; the server's complete handler is idempotent
  // anyway, but firing twice would double the audit-log noise.
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    complete.mutate({
      ...(homeChain !== null ? { home_chain: homeChain } : {}),
    });

    const holdMs = reducedMotion ? MIN_HOLD_MS_REDUCED : MIN_HOLD_MS_FULL;
    const handle = window.setTimeout(() => setHoldElapsed(true), holdMs);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route home only when BOTH the animation has held its minimum AND
  // the server has confirmed completion. Errors abort the redirect so
  // the user can see + retry.
  useEffect(() => {
    if (!holdElapsed) return;
    if (complete.isSuccess) {
      router.replace("/");
    }
  }, [holdElapsed, complete.isSuccess, router]);

  if (complete.isError) {
    return (
      <section className="mx-auto mt-16 max-w-xl px-8">
        <div className="bcc-panel p-6">
          <h2 className="bcc-stencil text-2xl text-ink">
            Couldn&apos;t finish onboarding
          </h2>
          <p className="mt-2 font-serif text-ink-soft">
            {complete.error.message}
          </p>
          <button
            type="button"
            onClick={() => {
              complete.reset();
              firedRef.current = false;
              complete.mutate({
                ...(homeChain !== null ? { home_chain: homeChain } : {}),
              });
            }}
            className="bcc-mono mt-4 text-blueprint underline"
          >
            Try again
          </button>
        </div>
      </section>
    );
  }

  // Cap the visible flying chips so the animation doesn't get crowded
  // when a user pulled a dozen cards. The stat-pop's "+ N" still
  // reflects the true count.
  const visibleChips = pulledCards.slice(0, 6);

  return (
    <section
      className={
        "relative mx-auto mt-12 flex h-[560px] max-w-6xl items-center justify-center px-8 " +
        (reducedMotion ? "" : "bcc-dopamine-backdrop")
      }
      aria-live="polite"
      aria-label="Welcome to the Floor"
    >
      {/* Binder dock — the destination for the chips. */}
      <div className="absolute right-8 top-6 flex flex-col items-end gap-1">
        <div className="bcc-panel flex h-14 w-14 items-center justify-center text-2xl">
          📒
        </div>
        <span className="bcc-mono text-[10px] text-cardstock-deep">Binder</span>
      </div>

      {/* Flying chips — only when motion is allowed. */}
      {!reducedMotion &&
        visibleChips.map((card, i) => (
          <span
            key={card.id}
            className={`bcc-dopamine-chip bcc-dopamine-chip-${tierClassName(card.tier)}`}
            style={{
              ["--bcc-dopamine-delay" as string]: `${i * 120}ms`,
            }}
            aria-hidden="true"
          />
        ))}

      <div className={reducedMotion ? "" : "bcc-dopamine-statpop"}>
        <div className="bcc-panel px-8 py-6 text-center">
          <p className="bcc-stencil text-3xl text-ink md:text-4xl">
            You&apos;re on the Floor.
          </p>
          {/* Rank label is server-rendered (§A2) — completion response
              echoes the user's current rank. Empty string = suppress
              the segment (server didn't have one to send). */}
          <p className="bcc-mono mt-3 text-ink-soft">
            +{pulledCards.length} card{pulledCards.length === 1 ? "" : "s"}
            {complete.data !== undefined && complete.data.rank_label !== "" && (
              <>
                {" · "}{complete.data.rank_label} rank
              </>
            )}
            {homeChain !== null && (
              <>
                {" · "}home: <span className="text-ink">{homeChain}</span>
              </>
            )}
          </p>
          {complete.isPending && (
            <p className="bcc-mono mt-3 text-[10px] text-ink-soft/70">
              Saving…
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function tierClassName(tier: CardTier): string {
  // Tailwind/JIT can't see dynamic class joins, so the receiving
  // .bcc-dopamine-chip-{name} CSS rules must be statically present in
  // globals.css. Same name set as §C1 (legendary/rare/uncommon/common,
  // plus a "neutral" fallback for risky/null which the chip still
  // renders since it represents *a pull happened*).
  switch (tier) {
    case "legendary": return "legendary";
    case "rare":      return "rare";
    case "uncommon":  return "uncommon";
    case "common":    return "common";
    case null:        return "neutral";
  }
}

// ─────────────────────────────────────────────────────────────────────
// useWizardPulls — pulled-state machine driven by the server.
//
// Source of truth split:
//   - `isPulled(cardId)` reads the binder query (`useBinder()`). This
//     is the *real* "is this in my binder right now" state — it
//     correctly shows pre-existing binder rows from earlier sessions
//     as already-pulled.
//   - `pulledCount` + `snapshot()` track ONLY this wizard session's
//     pulls. The §O1 dopamine moment is a celebration of what the
//     user just did, not their lifetime collection. We can't derive
//     the visual `card_tier` from a generic BinderItem (which only
//     carries the raw reputation tier per §A4) — but every pull made
//     during the wizard goes through a Card view-model that already
//     carries the server-computed `card_tier`. Snapshot reads the
//     session map; pre-existing pulls don't appear (correct).
//
// Optimistic overlay: while a pull or unpull is IN FLIGHT, the
// `isPulled` view flips to the target state for crisp UI; the click
// is gated when pending.
// ─────────────────────────────────────────────────────────────────────

interface WizardPullsApi {
  isPulled: (cardId: number) => boolean;
  isPending: (cardId: number) => boolean;
  errorFor: (cardId: number) => string | null;
  toggle: (card: Card) => void;
  /** Count of cards pulled IN THIS WIZARD SESSION (not lifetime binder size). */
  pulledCount: number;
  /** True while ANY pull/unpull mutation is in flight. Gates wizard nav. */
  anyPending: boolean;
  /** Session-only snapshot of pulled cards (id + card_tier) for the dopamine step. */
  snapshot: () => ReadonlyArray<{ id: number; tier: CardTier }>;
}

function useWizardPulls(): WizardPullsApi {
  const pullMut = usePullMutation();
  const unpullMut = useUnpullMutation();

  // Page size 50: comfortable headroom for the wizard's <=12 surfaced
  // cards. A larger pre-existing binder won't change the wizard's
  // state machine — we only key by card_id.
  const binder = useBinder({ page_size: 50 });

  const [pending, setPending] = useState<ReadonlySet<number>>(new Set());
  const [errors, setErrors] = useState<ReadonlyMap<number, string>>(new Map());
  // Session-only map of cards pulled during THIS wizard run. Value is
  // the server-computed `card_tier` from the Card view-model, captured
  // at successful pull time. Unpull during the same session removes
  // the entry. State (not ref) so consumers re-render when the count
  // changes.
  const [sessionPulls, setSessionPulls] = useState<ReadonlyMap<number, CardTier>>(
    new Map()
  );

  const followIds = useMemo<ReadonlyMap<number, number>>(() => {
    const map = new Map<number, number>();
    if (binder.data !== undefined) {
      for (const item of binder.data.items) {
        map.set(item.card_id, item.follow_id);
      }
    }
    return map;
  }, [binder.data]);

  const setPendingFor = (cardId: number, isPending: boolean) => {
    setPending((prev) => {
      const next = new Set(prev);
      if (isPending) {
        next.add(cardId);
      } else {
        next.delete(cardId);
      }
      return next;
    });
  };

  const setErrorFor = (cardId: number, message: string | null) => {
    setErrors((prev) => {
      const next = new Map(prev);
      if (message === null) {
        next.delete(cardId);
      } else {
        next.set(cardId, message);
      }
      return next;
    });
  };

  const recordSessionPull = (cardId: number, tier: CardTier) => {
    setSessionPulls((prev) => {
      const next = new Map(prev);
      next.set(cardId, tier);
      return next;
    });
  };

  const dropSessionPull = (cardId: number) => {
    setSessionPulls((prev) => {
      if (!prev.has(cardId)) return prev;
      const next = new Map(prev);
      next.delete(cardId);
      return next;
    });
  };

  const toggle = (card: Card) => {
    setErrorFor(card.id, null);
    if (pending.has(card.id)) return;

    const followId = followIds.get(card.id);
    setPendingFor(card.id, true);

    if (followId !== undefined) {
      unpullMut.mutate(followId, {
        onSuccess: () => dropSessionPull(card.id),
        onError: (err) => setErrorFor(card.id, err.message),
        onSettled: () => setPendingFor(card.id, false),
      });
    } else {
      pullMut.mutate(
        { target_kind: card.card_kind, target_id: card.id },
        {
          onSuccess: () => recordSessionPull(card.id, card.card_tier),
          onError: (err) => setErrorFor(card.id, err.message),
          onSettled: () => setPendingFor(card.id, false),
        }
      );
    }
  };

  const isPulled = (cardId: number): boolean => {
    const inBinder = followIds.has(cardId);
    return pending.has(cardId) ? !inBinder : inBinder;
  };

  return {
    isPulled,
    isPending: (cardId: number) => pending.has(cardId),
    errorFor: (cardId: number) => errors.get(cardId) ?? null,
    toggle,
    pulledCount: sessionPulls.size,
    anyPending: pending.size > 0,
    snapshot: () => {
      const out: Array<{ id: number; tier: CardTier }> = [];
      for (const [cardId, tier] of sessionPulls) {
        out.push({ id: cardId, tier });
      }
      return out;
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// SuggestionsBody — handles the three states (loading / error / data)
// for the card grid. Empty buckets collapse silently per §N10.
// ─────────────────────────────────────────────────────────────────────

interface SuggestionsBodyProps {
  result: ReturnType<typeof useOnboardingSuggestions>;
  pulls: WizardPullsApi;
}

function SuggestionsBody({ result, pulls }: SuggestionsBodyProps) {
  if (result.isLoading) {
    return (
      <section className="mx-auto mt-12 flex max-w-6xl justify-center px-8">
        <p className="bcc-mono text-cardstock-deep">Loading suggestions…</p>
      </section>
    );
  }

  if (result.isError) {
    return (
      <section className="mx-auto mt-12 max-w-6xl px-8">
        <p role="alert" className="bcc-mono text-safety">
          Couldn&apos;t load suggestions: {result.error.message}
        </p>
        <button
          type="button"
          onClick={() => {
            void result.refetch();
          }}
          className="bcc-mono mt-3 text-cardstock-deep underline"
        >
          Try again
        </button>
      </section>
    );
  }

  const data = result.data;
  if (data === undefined) {
    return null;
  }

  const allCards = flattenSuggestions(data);

  if (allCards.length === 0) {
    return (
      <section className="mx-auto mt-12 max-w-6xl px-8">
        <div className="bcc-panel mx-auto max-w-xl p-6">
          <h2 className="bcc-stencil text-2xl text-ink">No suggestions yet</h2>
          <p className="mt-2 font-serif text-ink-soft">
            The Floor is still warming up — once admins curate cards, they&apos;ll
            show here. Skip this step and head to the Floor.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-12 max-w-6xl px-8">
      <div className="bcc-mono mb-6 flex items-center gap-3 text-cardstock-deep">
        <span className="inline-block h-px w-8 bg-cardstock-edge/50" />
        <span>Curated for you</span>
        <span className="inline-block h-px flex-1 bg-cardstock-edge/50" />
      </div>

      <div className="flex flex-wrap justify-center gap-10 md:gap-12">
        {allCards.map((card) => (
          <CardWithError key={`${card.card_kind}-${card.id}`} card={card} pulls={pulls} />
        ))}
      </div>
    </section>
  );
}

function CardWithError({ card, pulls }: { card: Card; pulls: WizardPullsApi }) {
  const isPulled = pulls.isPulled(card.id);
  const isPending = pulls.isPending(card.id);
  const error = pulls.errorFor(card.id);

  return (
    <div className="flex flex-col items-center gap-2">
      <CardFactory
        card={card}
        isPulled={isPulled}
        // Omit onPull entirely while pending so the button-click is a
        // no-op (CardFactory's internal pendingRef pattern). Passing
        // `undefined` explicitly violates exactOptionalPropertyTypes.
        {...(isPending ? {} : { onPull: pulls.toggle })}
      />
      {isPending && (
        <span className="bcc-mono text-cardstock-deep/70">{isPulled ? "Removing…" : "Pulling…"}</span>
      )}
      {error !== null && !isPending && (
        <span role="alert" className="bcc-mono max-w-[280px] text-center text-safety">
          {error}
        </span>
      )}
    </div>
  );
}

function flattenSuggestions(suggestions: OnboardingSuggestions): Card[] {
  return [
    ...suggestions.validators,
    ...suggestions.projects,
    ...suggestions.creators,
  ];
}
