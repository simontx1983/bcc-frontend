"use client";

/**
 * HomeChainStep — pick one of 5. Skippable. The choice is held in
 * parent state and posted on the final /complete call (per §B4 +
 * the OnboardingEndpoint's home_chain field). Extracted from
 * OnboardingWizard.tsx (Phase 3.3 god-component split); markup and
 * behavior unchanged.
 */

import type { HomeChain } from "@/lib/api/types";

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

export function HomeChainStep({
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
      <section className="mx-auto max-w-6xl px-6 pt-12 sm:px-8">
        <h1 className="bcc-stencil text-cardstock text-5xl md:text-6xl">
          Where do you spend most of your time?
        </h1>
        <p className="mt-4 max-w-2xl font-serif text-xl text-cardstock-deep">
          We&apos;ll bias your suggestions and your home Local toward this chain.
          Skip if you&apos;re chain-agnostic — you can change it later.
        </p>
      </section>

      <section className="mx-auto mt-10 max-w-6xl px-6 sm:px-8">
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
                <span className="bcc-stencil text-lg text-bcc-text">{opt.label}</span>
                <span className="bcc-mono text-[10px] text-bcc-text-secondary">{opt.blurb}</span>
              </button>
            );
          })}
        </div>
      </section>

      <footer className="mx-auto mt-12 flex max-w-6xl items-center justify-between gap-4 px-6 sm:px-8">
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
