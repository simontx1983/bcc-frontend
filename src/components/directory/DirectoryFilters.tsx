"use client";

/**
 * DirectoryFilters — kind / tier / sort / search controls atop the
 * §G1/§G2 directory grid.
 *
 * Stateless: parent owns the filter values and the `onChange` callback.
 * Drives URL state at the page level so a filter set is shareable +
 * back-button-navigable. The component itself just renders chips +
 * inputs and fires onChange.
 *
 * V1 controls (per §G2 launch checklist):
 *   - Kind chips (validator / project / creator)
 *   - Tier chips (elite / trusted / neutral / caution / risky)
 *   - Good-Standing-Only toggle (§G2) — restricts to tier ≥ neutral
 *   - Sort dropdown (trust / newest / vouches / followers)
 *   - Search box (debounced upstream)
 *
 * Deferred (per scope discipline §P): chain filter, self-bonded filter,
 * view toggle. Each requires either a schema change or an additional
 * backend filter that V1 does not yet expose.
 */

import type { ChangeEvent } from "react";

import { FilterChipRow } from "@/components/ui/FilterChipRow";
import type {
  DirectoryKind,
  DirectorySort,
  DirectoryTier,
} from "@/lib/api/types";
import { VALIDATOR_CHAIN_CATALOG } from "@/lib/validators/chain-catalog";

import { ScopedSearchField } from "@/components/search/ScopedSearchField";
import type { DirectoryFilters as Filters } from "@/hooks/useDirectory";

interface Props {
  value: Filters;
  onChange: (next: Filters) => void;
}

/**
 * An option's own label, for the active-filter chips on /directory and
 * /validators, so a chip never prints a wire slug. The raw value only
 * when no option matches (a value from an old link).
 */
export function filterOptionLabel<V extends string>(
  options: ReadonlyArray<{ value: V | null; label: string }>,
  value: V,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export const KIND_OPTIONS: { value: DirectoryKind | null; label: string }[] = [
  { value: null,        label: "All" },
  { value: "validator", label: "Validators" },
  { value: "project",   label: "Projects" },
  { value: "creator",   label: "Creators" },
];

export const TIER_OPTIONS: { value: DirectoryTier | null; label: string }[] = [
  { value: null,      label: "Any" },
  // "Elite" everywhere (Phillip): the filter, its chip and the card's
  // tier chip use one word.
  { value: "elite",   label: "Elite" },
  { value: "trusted", label: "Trusted" },
  { value: "neutral", label: "Neutral" },
  { value: "caution", label: "Caution" },
  // v1.57: filterable for the first time. The rarity slugs had no way to
  // express risky, so the one cohort an operator most needs to review was
  // the one the directory could not surface.
  { value: "risky",   label: "Risky" },
];

export const SORT_OPTIONS: { value: DirectorySort; label: string }[] = [
  { value: "trust",        label: "Trust" },
  { value: "endorsements", label: "Vouches" },
  { value: "followers",    label: "Watchers" },
  { value: "newest",       label: "Newest" },
];

/** GET /cards caps `q` at 100 characters. */
const CARDS_QUERY_MAX = 100;

/** The placeholder names what this search covers (Structure A §9). */
const DIRECTORY_SEARCH_PLACEHOLDER: Record<NonNullable<Filters["kind"]> | "all", string> = {
  all: "Search pages…",
  validator: "Search validators…",
  project: "Search projects…",
  creator: "Search creators…",
};

export function DirectoryFilters({ value, onChange }: Props) {
  const update = (patch: Partial<Filters>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <section
      aria-label="Directory filters"
      className="bcc-panel flex flex-col gap-5 p-5"
    >
      {/* Search row: scoped to the kind on screen (Structure A §9). */}
      <ScopedSearchField
        tone="cardstock"
        label="SEARCH"
        placeholder={DIRECTORY_SEARCH_PLACEHOLDER[value.kind ?? "all"]}
        value={value.q}
        onChange={(q) => update({ q })}
        onClear={() => update({ q: "" })}
        maxLength={CARDS_QUERY_MAX}
      />

      {/* Kind chips */}
      <FilterChipRow
        label="KIND"
        options={KIND_OPTIONS}
        selected={value.kind}
        onSelect={(next) => {
          // Switching kind away from `validator` clears the chain filter
          // — the chain JOIN only applies to validator pages today, so
          // a stale chain selection on a non-validator kind would just
          // silently zero out results.
          const nextChain = next === "validator" ? value.chain : null;
          update({ kind: next, chain: nextChain });
        }}
      />

      {/* Chain dropdown — only meaningful for validator kind today; the
          backend JOIN goes through `_bcc_onchain_validator_id` post_meta
          which only validator pages carry. */}
      {value.kind === "validator" && (
        <div className="flex flex-col gap-2">
          <label
            htmlFor="directory-chain"
            className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep"
          >
            CHAIN
          </label>
          <select
            id="directory-chain"
            value={value.chain ?? ""}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              update({ chain: e.target.value === "" ? null : e.target.value })
            }
            className="bcc-mono w-full bg-cardstock px-3 py-2 text-sm text-ink ring-1 ring-cardstock-edge focus:outline-none focus:ring-2 focus:ring-blueprint"
          >
            <option value="">All chains</option>
            {VALIDATOR_CHAIN_CATALOG.map((opt) => (
              <option key={opt.slug} value={opt.slug}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Tier chips */}
      <FilterChipRow
        label="TIER"
        options={TIER_OPTIONS}
        selected={value.tier}
        onSelect={(next) => update({ tier: next })}
      />

      {/* Good-Standing-Only toggle (§G2) */}
      <div className="flex flex-col gap-2">
        <span className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep">
          STANDING
        </span>
        <label className="bcc-mono inline-flex cursor-pointer items-center gap-2 self-start border border-cardstock-edge bg-cardstock px-3 py-2 text-sm text-ink ring-1 ring-cardstock-edge transition hover:border-blueprint has-[:checked]:border-blueprint has-[:checked]:bg-blueprint/10 has-[:checked]:text-blueprint">
          <input
            type="checkbox"
            checked={value.goodStandingOnly}
            onChange={(e) => update({ goodStandingOnly: e.target.checked })}
            className="h-3 w-3 accent-blueprint"
          />
          <span>GOOD STANDING ONLY</span>
        </label>
      </div>

      {/* Sort */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="directory-sort"
          className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep"
        >
          SORT BY
        </label>
        <select
          id="directory-sort"
          value={value.sort}
          onChange={(e: ChangeEvent<HTMLSelectElement>) =>
            update({ sort: e.target.value as DirectorySort })
          }
          className="bcc-mono w-full bg-cardstock px-3 py-2 text-sm text-ink ring-1 ring-cardstock-edge focus:outline-none focus:ring-2 focus:ring-blueprint"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}

