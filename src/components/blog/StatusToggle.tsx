"use client";

/**
 * StatusToggle — DRAFT / PUBLISH selector for the composer.
 *
 * The composer's submit button label reflects the choice. Drafts
 * land server-side with `post_status='draft'` — they're invisible
 * on the Floor until the writer flips to publish.
 */

export type BlogStatus = "draft" | "publish";

export interface StatusToggleProps {
  value: BlogStatus;
  onChange: (next: BlogStatus) => void;
  disabled?: boolean;
}

const OPTIONS: ReadonlyArray<{ key: BlogStatus; label: string; detail: string }> = [
  { key: "draft",   label: "DRAFT",   detail: "Save without surfacing to the Floor." },
  { key: "publish", label: "PUBLISH", detail: "Surface to the Floor immediately." },
];

export function StatusToggle({ value, onChange, disabled = false }: StatusToggleProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Publish state"
      className="inline-flex items-center gap-1 rounded-sm border border-cardstock-edge/30 bg-cardstock/40 p-1"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            role="radio"
            aria-checked={active}
            title={opt.detail}
            onClick={() => onChange(opt.key)}
            disabled={disabled}
            className={
              "bcc-mono px-3 py-1.5 text-[11px] tracking-[0.18em] transition " +
              (active
                ? "bg-ink text-cardstock"
                : "text-ink-soft hover:text-ink")
            }
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
