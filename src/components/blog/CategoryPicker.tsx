"use client";

/**
 * CategoryPicker — required single-select category for the composer.
 *
 * Renders a horizontal radio strip with the 6 V1 categories. No
 * default value — `value === null` until the writer picks. The
 * composer's submit button stays disabled while `null`.
 *
 * Sits above the body field per the V1 brief — the first decision
 * the writer makes about a post is "what kind of post is this?"
 */

import type { BlogCategory } from "@/lib/api/types";

interface CategoryOption {
  key: BlogCategory;
  label: string;
  detail: string;
}

const OPTIONS: ReadonlyArray<CategoryOption> = [
  { key: "news",     label: "News",     detail: "Time-sensitive — what just happened." },
  { key: "analysis", label: "Analysis", detail: "Long-form research / deep dive." },
  { key: "guide",    label: "Guide",    detail: "How-to / actionable evergreen." },
  { key: "opinion",  label: "Opinion",  detail: "Author POV / commentary." },
  { key: "tools",    label: "Tools",    detail: "Product / tooling reviews." },
  { key: "events",   label: "Events",   detail: "Conference / hackathon coverage." },
];

export interface CategoryPickerProps {
  value: BlogCategory | null;
  onChange: (next: BlogCategory) => void;
  disabled?: boolean;
}

export function CategoryPicker({ value, onChange, disabled = false }: CategoryPickerProps) {
  return (
    <fieldset
      className="flex flex-col gap-2"
      disabled={disabled}
      aria-required="true"
    >
      <legend className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
        CATEGORY <span className="text-safety">*</span>
      </legend>
      <div
        role="radiogroup"
        aria-label="Post category"
        className="flex flex-wrap gap-2"
      >
        {OPTIONS.map((opt) => {
          const active = value === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.key)}
              title={opt.detail}
              className={
                "bcc-mono shrink-0 border px-3 py-2 text-[11px] tracking-[0.18em] transition " +
                (active
                  ? "border-safety bg-safety/10 text-safety"
                  : "border-cardstock-edge/30 text-cardstock-deep hover:border-cardstock-edge hover:text-cardstock")
              }
            >
              {opt.label.toUpperCase()}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
