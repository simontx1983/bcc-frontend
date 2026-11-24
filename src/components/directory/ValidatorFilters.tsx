"use client";

/**
 * ValidatorFilters — filter controls for Explore ▸ Validators (/explore).
 *
 * Sibling to DirectoryFilters, but specialised for the single
 * `kind=validator` slice, so it:
 *   - DROPS the kind chips (the page is implicitly validators-only)
 *   - ALWAYS shows the chain dropdown (no `kind === 'validator'` guard —
 *     every row here is a validator, so the chain JOIN is always valid)
 *   - ADDS validator-only axes the shared directory can't express:
 *       · Status chips (active / jailed / inactive)
 *       · Self-stake in the sort dropdown (bonded self-stake, DESC)
 *   - KEEPS search and the tier chips (TIER_OPTIONS, shared with the
 *     other Explore tabs, so "Elite" reads the same everywhere). Tier
 *     came back with Site Structure A: old /directory?kind=validator&tier=…
 *     links forward here, and Explore filters every tab by tier.
 *
 * Leaner than DirectoryFilters: good-standing and the min-self-stake floor
 * are not on this surface (the underlying `DirectoryFilters` shape still
 * carries those fields — they default to false/null here).
 *
 * Stateless like DirectoryFilters: the parent owns the filter values +
 * URL state, this component just renders controls and fires onChange.
 */

import type { ChangeEvent } from "react";

import { TIER_OPTIONS } from "@/components/directory/DirectoryFilters";
import { ScopedSearchField } from "@/components/search/ScopedSearchField";
import { FilterChipRow } from "@/components/ui/FilterChipRow";
import type {
  DirectorySort,
  ValidatorStatusFilter,
} from "@/lib/api/types";
import { VALIDATOR_CHAIN_CATALOG } from "@/lib/validators/chain-catalog";

import type { DirectoryFilters as Filters } from "@/hooks/useDirectory";

interface Props {
  value: Filters;
  onChange: (next: Filters) => void;
}

export const STATUS_OPTIONS: { value: ValidatorStatusFilter | null; label: string }[] = [
  { value: null,       label: "Any" },
  { value: "active",   label: "Active" },
  { value: "jailed",   label: "Jailed" },
  { value: "inactive", label: "Inactive" },
];

export const SORT_OPTIONS: { value: DirectorySort; label: string }[] = [
  { value: "trust",        label: "Trust" },
  { value: "self_stake",   label: "Self stake" },
  { value: "endorsements", label: "Vouches" },
  { value: "followers",    label: "Watchers" },
  { value: "newest",       label: "Newest" },
];

export function ValidatorFilters({ value, onChange }: Props) {
  const update = (patch: Partial<Filters>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <section
      aria-label="Validator filters"
      className="bcc-panel flex flex-col gap-5 p-5"
    >
      {/* Search row: scoped to validators (Structure A §9). GET /cards caps q at 100. */}
      <ScopedSearchField
        tone="cardstock"
        label="SEARCH"
        placeholder="Search validators by moniker or @handle…"
        value={value.q}
        onChange={(q) => update({ q })}
        onClear={() => update({ q: "" })}
        maxLength={100}
      />

      {/* Chain dropdown — always shown; every row here is a validator. */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="validators-chain"
          className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep"
        >
          CHAIN
        </label>
        <select
          id="validators-chain"
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

      {/* Status chips (validator-only) */}
      <FilterChipRow
        label="STATUS"
        options={STATUS_OPTIONS}
        selected={value.status ?? null}
        onSelect={(next) => update({ status: next })}
      />

      {/* Tier chips — shared with the other Explore tabs */}
      <FilterChipRow
        label="TIER"
        options={TIER_OPTIONS}
        selected={value.tier}
        onSelect={(next) => update({ tier: next })}
      />

      {/* Sort */}
      <div className="flex flex-col gap-2">
        <label
          htmlFor="validators-sort"
          className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep"
        >
          SORT BY
        </label>
        <select
          id="validators-sort"
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
