"use client";

/**
 * FirstPullsStep — Step 2. Reuses the suggestion grid + per-card pull
 * state from the original wizard. Extracted from OnboardingWizard.tsx
 * (Phase 3.3 god-component split); markup and behavior unchanged.
 * SuggestionsBody / CardWithError / flattenSuggestions ride along —
 * they're step-2-only vocabulary.
 */

import { CardFactory } from "@/components/cards/CardFactory";
import { useOnboardingSuggestions } from "@/hooks/useOnboardingSuggestions";
import { humanizeCode } from "@/lib/api/errors";
import type { Card, OnboardingSuggestions } from "@/lib/api/types";

import type { WizardPullsApi } from "./useWizardPulls";

export function FirstPullsStep({
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
      <section className="mx-auto max-w-6xl px-6 pt-12 sm:px-8">
        <h1 className="bcc-stencil text-cardstock text-5xl md:text-6xl">
          Start watching.
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-xl text-cardstock-deep">
          Pick the validators, projects, and creators you want to keep tabs on.
          Your watchlist + Floor feed start with the cards you pick here.
        </p>
        <p className="bcc-mono mt-3 text-cardstock-deep/70">
          Skipping is fine — you can start watching any time.
        </p>
      </section>

      <SuggestionsBody result={suggestions} pulls={pulls} />

      <footer className="mx-auto mt-16 flex max-w-6xl items-center justify-between gap-4 px-6 sm:px-8">
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
            server flips `onboarded` before the watchlist row lands. */}
        <button
          type="button"
          onClick={onDone}
          disabled={pulls.anyPending}
          aria-disabled={pulls.anyPending}
          className="bcc-stencil flex items-center gap-3 bg-safety px-6 py-3 text-ink disabled:cursor-wait disabled:opacity-60"
        >
          {pulls.anyPending
            ? "Saving…"
            : pulls.pulledCount > 0
              ? `Done (${pulls.pulledCount} on your list)`
              : "Done — skip for now"}
        </button>
      </footer>
    </>
  );
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
      <section className="mx-auto mt-12 flex max-w-6xl justify-center px-6 sm:px-8">
        <p className="bcc-mono text-cardstock-deep">Loading suggestions…</p>
      </section>
    );
  }

  if (result.isError) {
    return (
      <section className="mx-auto mt-12 max-w-6xl px-6 sm:px-8">
        <p role="alert" className="bcc-mono text-safety">
          {/* §γ — copy is keyed on err.code; never render err.message. */}
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
      <section className="mx-auto mt-12 max-w-6xl px-6 sm:px-8">
        <div className="bcc-panel mx-auto max-w-xl p-6">
          <h2 className="bcc-stencil text-2xl text-bcc-text">No suggestions yet</h2>
          <p className="mt-2 font-serif text-bcc-text-secondary">
            The Floor is still warming up — once admins curate cards, they&apos;ll
            show here. Skip this step and head to the Floor.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto mt-12 max-w-6xl px-6 sm:px-8">
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
        <span className="bcc-mono text-cardstock-deep/70">{isPulled ? "Removing…" : "Saving…"}</span>
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
