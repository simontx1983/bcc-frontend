"use client";

/**
 * ValidatorFilters — filter controls for the dedicated /validators page.
 *
 * Sibling to DirectoryFilters, but specialised for the single
 * `kind=validator` slice, so it:
 *   - DROPS the kind chips (the page is implicitly validators-only)
 *   - ALWAYS shows the chain dropdown (no `kind === 'validator'` guard —
 *     every row here is a validator, so the chain JOIN is always valid)
 *   - ADDS validator-only axes the shared directory can't express:
 *       · Status chips (active / jailed / inactive)
 *       · Self-stake in the sort dropdown (bonded self-stake, DESC)
 *   - KEEPS search verbatim
 *
 * Deliberately leaner than DirectoryFilters: tier, good-standing, and the
 * min-self-stake floor were dropped from this surface (the underlying
 * `DirectoryFilters` shape still carries those fields — they just default
 * to null/false here and the shared /directory still exposes them).
 *
 * Stateless like DirectoryFilters: the parent owns the filter values +
 * URL state, this component just renders controls and fires onChange.
 */

import type { ChangeEvent } from "react";

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

const STATUS_OPTIONS: { value: ValidatorStatusFilter | null; label: string }[] = [
  { value: null,       label: "Any" },
  { value: "active",   label: "Active" },
  { value: "jailed",   label: "Jailed" },
  { value: "inactive", label: "Inactive" },
];

const SORT_OPTIONS: { value: DirectorySort; label: string }[] = [
  { value: "trust",        label: "Trust" },
  { value: "self_stake",   label: "Self stake" },
  { value: "endorsements", label: "Endorsements" },
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
      {/* Search row */}
      <div className="flex flex-col gap-2">
        <label className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep">
          SEARCH
        </label>
        <input
          type="search"
          value={value.q}
          onChange={(e: ChangeEvent<HTMLInputElement>) => update({ q: e.target.value })}
          placeholder="Moniker or handle…"
          className="bcc-mono w-full bg-cardstock px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none ring-1 ring-cardstock-edge focus:ring-2 focus:ring-blueprint"
        />
      </div>

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
