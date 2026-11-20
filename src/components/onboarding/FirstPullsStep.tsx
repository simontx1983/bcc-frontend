"use client";

/**
 * FirstPullsStep — first-watch suggestions + the folded-in home-chain
 * bias picker. Each Watch commits immediately to the watchlist (real
 * mutation via useWizardPulls); the server's batch aggregator decides
 * when those become a feed item (§C3). The home-chain "bias toward" chip
 * row (previously its own wizard step) lives at the top here — the pick
 * threads up to the parent and is persisted on the final /complete call.
 *
 * F-439: the pick also goes to /onboarding/suggestions as `?chain=`, which
 * puts that chain's validators first. The heading and status line claim
 * only what the response's `bias` says happened (see chainStatusLine).
 *
 * Restyled onto the `bcc-onb-*` page-chrome namespace. The suggestion
 * cards keep their own tier tokens (trading-card faces are the sanctioned
 * exception to the page-chrome rule).
 */

import { useId } from "react";

import { CardFactory } from "@/components/cards/CardFactory";
import { LandingReveal } from "@/components/landing/LandingReveal";
import { SKELETON_CLASS } from "@/components/ui/Skeleton";
import { useOnboardingSuggestions } from "@/hooks/useOnboardingSuggestions";
import { humanizeCode } from "@/lib/api/errors";
import type { Card, HomeChain, OnboardingSuggestions } from "@/lib/api/types";

import type { WizardPullsApi } from "./useWizardPulls";

interface ChainOption {
  id: HomeChain;
  label: string;
}

const CHAIN_OPTIONS: ReadonlyArray<ChainOption> = [
  { id: "cosmos",    label: "Cosmos" },
  { id: "osmosis",   label: "Osmosis" },
  { id: "injective", label: "Injective" },
  { id: "ethereum",  label: "Ethereum" },
  { id: "solana",    label: "Solana" },
];

export function FirstPullsStep({
  pulls,
  homeChain,
  onSelectChain,
  onBack,
  onDone,
}: {
  pulls: WizardPullsApi;
  homeChain: HomeChain | null;
  onSelectChain: (chain: HomeChain | null) => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const suggestions = useOnboardingSuggestions(homeChain);
  const headingId = useId();
  // F-439: every claim about the chips is read from the RESPONSE. A backend
  // that predates the chain bias ignores ?chain= and sends no `bias` key,
  // so until a response carries that key the heading claims nothing about
  // the suggestions.
  const canBias = suggestions.data !== undefined && suggestions.data.bias !== undefined;
  const isUpdating = suggestions.isPlaceholderData;
  const status = chainStatusLine(suggestions.data, homeChain, isUpdating);

  return (
    <section className="bcc-onb-step">
      <LandingReveal as="p" className="bcc-onb-eyebrow">
        Start watching
      </LandingReveal>
      <LandingReveal>
        <h1 className="bcc-onb-disp">Pick who to watch.</h1>
        <p className="bcc-onb-lede">
          Pick the validators, projects, and creators you want to watch. Your
          watchlist and Floor feed start with the cards you pick here.{" "}
          <b>Skipping is fine</b> — you can watch anyone, any time.
        </p>
      </LandingReveal>

      {/* Home-chain bias — folded in from the old standalone step. */}
      <div style={{ marginTop: "clamp(24px, 4vw, 36px)" }}>
        <span id={headingId} className="bcc-onb-field-label">
          {canBias ? "Bias validators toward" : "Your home chain"}
        </span>
        <div className="bcc-onb-chips" role="group" aria-labelledby={headingId}>
          {CHAIN_OPTIONS.map((opt) => {
            const active = homeChain === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                aria-pressed={active}
                className={"bcc-onb-chip" + (active ? " is-active" : "")}
                onClick={() => onSelectChain(active ? null : opt.id)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
        {/* The pick is persisted on /complete whatever the suggestions do. */}
        {canBias && <p className="bcc-onb-note">Also sets your home chain.</p>}
        {/* Always mounted, so the first message is announced. */}
        <p role="status" className="bcc-onb-note" style={{ marginTop: "4px" }}>
          {status}
        </p>
      </div>

      <SuggestionsBody result={suggestions} pulls={pulls} isUpdating={isUpdating} />

      <footer className="bcc-onb-foot">
        {/*
          Back is NEVER gated on an in-flight pull. It used to be, which
          meant a single hung watch request froze both directions and left
          the visitor with no way out of the step. Going back does not
          cancel or roll back a pull that the server already accepted — the
          watchlist is server-owned and the mutation settles on its own.
        */}
        <button type="button" className="bcc-onb-link" onClick={onBack}>
          ← Back
        </button>
        {/* Gate Done while any pull is in flight — otherwise the /complete
            mutation can race a still-flying pull and the server flips
            `onboarded` before the watchlist row lands. */}
        <button
          type="button"
          onClick={onDone}
          disabled={pulls.anyPending}
          aria-disabled={pulls.anyPending}
          className="bcc-onb-btn bcc-onb-btn-primary"
        >
          {pulls.anyPending
            ? "Saving…"
            : pulls.pulledCount > 0
              ? `Continue (${pulls.pulledCount} on your list)`
              : "Continue — skip for now"}
        </button>
      </footer>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SuggestionsBody — loading / error / data states for the card grid.
// Empty buckets collapse silently per §N10.
// ─────────────────────────────────────────────────────────────────────

interface SuggestionsBodyProps {
  result: ReturnType<typeof useOnboardingSuggestions>;
  pulls: WizardPullsApi;
  /** The previous chip's cards are on screen while the new chip's load. */
  isUpdating: boolean;
}

function SuggestionsBody({ result, pulls, isUpdating }: SuggestionsBodyProps) {
  if (result.isLoading) {
    return <SuggestionsSkeleton />;
  }

  if (result.isError) {
    return (
      <div style={{ marginTop: "40px" }}>
        <p role="alert" className="bcc-onb-err">
          {/* §γ — copy keyed on err.code; never render err.message. */}
          {humanizeCode(
            result.error,
            {
              bcc_unauthorized: "Sign in to see suggestions.",
              bcc_rate_limited: "Loading too fast — give it a moment and try again.",
              bcc_unavailable: "Suggestions are temporarily unavailable. Try again shortly.",
            },
            "Couldn't load suggestions. Try again in a moment.",
          )}
        </p>
        <button type="button" className="bcc-onb-link" onClick={() => { void result.refetch(); }} style={{ marginTop: "8px" }}>
          Try again
        </button>
      </div>
    );
  }

  const data = result.data;
  if (data === undefined) return null;

  const allCards = flattenSuggestions(data);

  // An empty answer for the PREVIOUS chip says nothing about the new one.
  if (allCards.length === 0 && isUpdating) {
    return <SuggestionsSkeleton />;
  }

  if (allCards.length === 0) {
    return (
      <div className="bcc-onb-panel" style={{ marginTop: "40px", maxWidth: "40ch" }}>
        <h2 className="bcc-onb-disp" style={{ fontSize: "1.6rem" }}>No suggestions yet</h2>
        <p className="bcc-onb-lede" style={{ marginTop: "10px", fontSize: "1rem" }}>
          There are no cards to suggest right now. Skip this step and head to the
          Floor &mdash; you can watch anyone, any time.
        </p>
      </div>
    );
  }

  return (
    <SuggestionsFrame busy={isUpdating}>
      {allCards.map((card) => (
        <CardWithError key={`${card.card_kind}-${card.id}`} card={card} pulls={pulls} />
      ))}
    </SuggestionsFrame>
  );
}

/**
 * The suggestions block: its label row and the wrapping card row. Shared
 * by the loaded grid and its skeleton so the two occupy the same box.
 * `busy`: the cards are the previous chip's, dimmed until the new ones land.
 */
function SuggestionsFrame({ children, busy = false }: { children: React.ReactNode; busy?: boolean }) {
  return (
    <div
      aria-busy={busy}
      className={busy ? "opacity-60" : undefined}
      style={{ marginTop: "clamp(28px, 5vw, 48px)" }}
    >
      <div className="bcc-onb-field-label" style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <span style={{ height: "1px", width: "32px", background: "var(--bcc-border)" }} />
        <span>Curated for you</span>
        <span style={{ height: "1px", flex: 1, background: "var(--bcc-border)" }} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "clamp(28px, 5vw, 48px)" }}>
        {children}
      </div>
    </div>
  );
}

/** Placeholder tiles while the suggestions load: one per bucket. */
const SKELETON_TILES = 3;

/**
 * F-264: loading used to be one line of text, so the step jumped by a
 * card's height when the suggestions arrived. These tiles take the card's
 * own box: 316 × 440, and below 381px the card's narrow rule (globals.css
 * `.bcc-card` under `max-width: 380px`) of full width capped at 296px with
 * the same aspect ratio. The tiles are hidden from assistive tech; the
 * sr-only line says what is happening, as the visible text did.
 */
function SuggestionsSkeleton() {
  return (
    <div aria-busy="true">
      <p className="sr-only">Loading suggestions…</p>
      <SuggestionsFrame>
        {Array.from({ length: SKELETON_TILES }, (_, i) => (
          // The card wrapper's width, as a class: onboarding-foundations
          // pins the card's own inline width as the one load-bearing rule.
          <div key={i} aria-hidden className="w-[min(316px,100%)]">
            <div
              data-testid="suggestion-skeleton"
              className={`${SKELETON_CLASS} aspect-[316/440] w-full max-w-[296px] min-[381px]:max-w-[316px]`}
            />
          </div>
        ))}
      </SuggestionsFrame>
    </div>
  );
}

function CardWithError({ card, pulls }: { card: Card; pulls: WizardPullsApi }) {
  const isPulled = pulls.isPulled(card);
  const isPending = pulls.isPending(card.id);
  const error = pulls.errorFor(card.id);

  return (
    /*
      The two width declarations here are load-bearing, not cosmetic.

      Below 380px `.bcc-card` becomes `width: 100%; height: auto;
      aspect-ratio: 316/440`, and it sits inside `.bcc-card-stage`, which
      declares only `perspective` — no width. The card's own in-flow
      descendant `.bcc-card-face` is `position: absolute`, so it
      contributes no intrinsic width either. That left the percentage with
      nothing to resolve against: measured in a real browser at 375px (the
      project's documented primary target), every suggestion card computed
      to 0 × 0 and the entire grid occupied no space at all.

      Fixing it takes BOTH:
        1. this wrapper needs a definite width — `min()` keeps it inside
           the 296px cap the narrow rule sets, without exceeding its column;
        2. an explicit `width: 100%` on the card's block-level ancestor.
           `align-items: center` makes flex children shrink-to-fit, so the
           stage would otherwise still collapse even though its parent now
           has a width. An explicit width beats the shrink-to-fit default.
    */
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", width: "min(316px, 100%)" }}>
      <div style={{ width: "100%" }}>
        <CardFactory
          card={card}
          isPulled={isPulled}
          // A body mis-click must not navigate away mid-wizard — the
          // card is a selection tile here, not a nav target.
          suppressBodyLink
          // Omit onPull while pending so the click is a no-op; passing
          // `undefined` explicitly violates exactOptionalPropertyTypes.
          {...(isPending ? {} : { onPull: pulls.toggle })}
        />
      </div>
      {isPending && (
        <span className="bcc-onb-note">{isPulled ? "Removing…" : "Saving…"}</span>
      )}
      {error !== null && !isPending && (
        <span role="alert" className="bcc-onb-err" style={{ maxWidth: "280px", textAlign: "center" }}>
          {error}
        </span>
      )}
    </div>
  );
}

/**
 * F-439 — the status line under the chips, read from the response only.
 * It names a chain only when `bias.chain` is the chip picked NOW, so the
 * previous chip's answer (still on screen as placeholder data) never
 * speaks for the new one, and a backend without `bias` never claims one.
 */
function chainStatusLine(
  data: OnboardingSuggestions | undefined,
  homeChain: HomeChain | null,
  isUpdating: boolean,
): string {
  if (isUpdating) return "Updating suggestions…";
  const bias = data?.bias;
  if (homeChain === null || bias === undefined || bias === null || bias.chain !== homeChain) {
    return "";
  }
  const label = CHAIN_OPTIONS.find((opt) => opt.id === homeChain)?.label ?? homeChain;
  return bias.applied_to.includes("validators")
    ? `${label} validators come first.`
    : `Validator suggestions are unchanged for ${label}.`;
}

function flattenSuggestions(suggestions: OnboardingSuggestions): Card[] {
  return [
    ...suggestions.validators,
    ...suggestions.projects,
    ...suggestions.creators,
  ];
}
