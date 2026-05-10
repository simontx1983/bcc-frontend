"use client";

/**
 * FilterChipRow — labelled row of single-select chips.
 *
 * Generic over the value type so each consumer can keep its own
 * union (DirectoryKind, DirectoryTier, ContentReportReason, …)
 * without `as` casts at the call site. The `null` value is the
 * conventional "no filter / all" sentinel; consumers don't have to
 * use it but the type permits it.
 *
 * Extracted from DirectoryFilters.tsx + duplicated FilterChip
 * implementations in app/directory/page.tsx and app/members/page.tsx.
 * §11 duplicate scan flagged the chip primitive as repeated three
 * times — this is the canonical home.
 */

interface FilterChipOption<T extends string | null> {
  value: T;
  label: string;
}

interface FilterChipRowProps<T extends string | null> {
  label: string;
  options: FilterChipOption<T>[];
  selected: T;
  onSelect: (value: T) => void;
}

export function FilterChipRow<T extends string | null>({
  label,
  options,
  selected,
  onSelect,
}: FilterChipRowProps<T>) {
  return (
    <div className="flex flex-col gap-2">
      <span className="bcc-mono text-[10px] tracking-[0.2em] text-cardstock-deep">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const isActive = opt.value === selected;
          return (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => onSelect(opt.value)}
              aria-pressed={isActive}
              className={
                "bcc-mono min-h-[36px] rounded-sm px-3 py-1.5 text-[10px] tracking-[0.18em] transition " +
                (isActive
                  ? "bg-ink text-cardstock"
                  : "bg-cardstock text-ink ring-1 ring-cardstock-edge hover:bg-cardstock-deep")
              }
            >
              {opt.label.toUpperCase()}
            </button>
          );
        })}
      </div>
    </div>
  );
}
