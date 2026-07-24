"use client";

/**
 * FirstPullsStep — first-watch suggestions + the folded-in home-chain
 * bias picker. Each Watch commits immediately to the watchlist (real
 * mutation via useWizardPulls); the server's batch aggregator decides
 * when those become a feed item (§C3). The home-chain "bias toward" chip
 * row (previously its own wizard step) lives at the top here — the pick
 * threads up to the parent and is persisted on the final /complete call.
 *
 * Restyled onto the `bcc-onb-*` page-chrome namespace. The suggestion
 * cards keep their own tier tokens (trading-card faces are the sanctioned
 * exception to the page-chrome rule).
 */

import { CardFactory } from "@/components/cards/CardFactory";
import { LandingReveal } from "@/components/landing/LandingReveal";
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
  const suggestions = useOnboardingSuggestions();

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
        <span className="bcc-onb-field-label">Bias suggestions toward</span>
        <div className="bcc-onb-chips">
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
      </div>

      <SuggestionsBody result={suggestions} pulls={pulls} />

      <footer className="bcc-onb-foot">
        <button type="button" className="bcc-onb-link" disabled={pulls.anyPending} onClick={onBack}>
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
}

function SuggestionsBody({ result, pulls }: SuggestionsBodyProps) {
  if (result.isLoading) {
    return (
      <p className="bcc-onb-note" style={{ marginTop: "40px", textAlign: "center" }}>
        Loading suggestions…
      </p>
    );
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

  if (allCards.length === 0) {
    return (
      <div className="bcc-onb-panel" style={{ marginTop: "40px", maxWidth: "40ch" }}>
        <h2 className="bcc-onb-disp" style={{ fontSize: "1.6rem" }}>No suggestions yet</h2>
        <p className="bcc-onb-lede" style={{ marginTop: "10px", fontSize: "1rem" }}>
          The Floor is still warming up — once admins curate cards, they&rsquo;ll show
          here. Skip this step and head to the Floor.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "clamp(28px, 5vw, 48px)" }}>
      <div className="bcc-onb-field-label" style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "20px" }}>
        <span style={{ height: "1px", width: "32px", background: "var(--bcc-border)" }} />
        <span>Curated for you</span>
        <span style={{ height: "1px", flex: 1, background: "var(--bcc-border)" }} />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "clamp(28px, 5vw, 48px)" }}>
        {allCards.map((card) => (
          <CardWithError key={`${card.card_kind}-${card.id}`} card={card} pulls={pulls} />
        ))}
      </div>
    </div>
  );
}

function CardWithError({ card, pulls }: { card: Card; pulls: WizardPullsApi }) {
  const isPulled = pulls.isPulled(card.id);
  const isPending = pulls.isPending(card.id);
  const error = pulls.errorFor(card.id);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
      <CardFactory
        card={card}
        isPulled={isPulled}
        // Omit onPull while pending so the click is a no-op; passing
        // `undefined` explicitly violates exactOptionalPropertyTypes.
        {...(isPending ? {} : { onPull: pulls.toggle })}
      />
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

function flattenSuggestions(suggestions: OnboardingSuggestions): Card[] {
  return [
    ...suggestions.validators,
    ...suggestions.projects,
    ...suggestions.creators,
  ];
}
