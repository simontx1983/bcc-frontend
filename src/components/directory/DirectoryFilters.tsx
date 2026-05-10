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
 *   - Tier chips (legendary / rare / uncommon / common)
 *   - Sort dropdown (trust / newest / endorsements / followers)
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

import type { DirectoryFilters as Filters } from "@/hooks/useDirectory";

interface Props {
  value: Filters;
  onChange: (next: Filters) => void;
}

const KIND_OPTIONS: { value: DirectoryKind | null; label: string }[] = [
  { value: null,        label: "All" },
  { value: "validator", label: "Validators" },
  { value: "project",   label: "Projects" },
  { value: "creator",   label: "Creators" },
];

const TIER_OPTIONS: { value: DirectoryTier | null; label: string }[] = [
  { value: null,        label: "Any" },
  { value: "legendary", label: "Legendary" },
  { value: "rare",      label: "Rare" },
  { value: "uncommon",  label: "Uncommon" },
  { value: "common",    label: "Common" },
];

const SORT_OPTIONS: { value: DirectorySort; label: string }[] = [
  { value: "trust",        label: "Trust" },
  { value: "endorsements", label: "Endorsements" },
  { value: "followers",    label: "Watchers" },
  { value: "newest",       label: "Newest" },
];

export function DirectoryFilters({ value, onChange }: Props) {
  const update = (patch: Partial<Filters>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <section
      aria-label="Directory filters"
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
          placeholder="Name or handle…"
          className="bcc-mono w-full bg-cardstock px-3 py-2 text-sm text-ink placeholder:text-ink-soft/60 focus:outline-none ring-1 ring-cardstock-edge focus:ring-2 focus:ring-blueprint"
        />
      </div>

      {/* Kind chips */}
      <FilterChipRow
        label="KIND"
        options={KIND_OPTIONS}
        selected={value.kind}
        onSelect={(next) => update({ kind: next })}
      />

      {/* Tier chips */}
      <FilterChipRow
        label="TIER"
        options={TIER_OPTIONS}
        selected={value.tier}
        onSelect={(next) => update({ tier: next })}
      />

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

