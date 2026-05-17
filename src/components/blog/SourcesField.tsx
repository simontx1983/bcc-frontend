"use client";

/**
 * SourcesField — numbered citations editor for the blog composer.
 *
 * §D6 V1.5 — author-declared list of references that render as a
 * numbered list at the post foot. Each entry is a free-form string
 * (URL, paper title, archived snapshot). Server trims, drops empties,
 * dedupes by exact match, and caps to BLOG_SOURCES_MAX entries.
 *
 * Collapsed by default — sources are opt-in but visible. The toggle
 * label flips to "SOURCES: N" once populated so the writer sees their
 * count at a glance.
 *
 * Three-state submit semantics (mirrored in `UpdateBlogRequest.sources`):
 *   - omitted   → leave existing list unchanged
 *   - `[]`      → clear
 *   - non-empty → replace
 *
 * The composer chooses which state to send by comparing the field's
 * current value against the initial value (see BlogComposer's submit
 * handler).
 *
 * §A2 server-pinned strings: validation errors come from the backend
 * `bcc_invalid_request` envelope. This component shows client-side
 * bounds hints only (count vs cap, per-entry char count vs cap), no
 * synthesized copy.
 */

import { useState } from "react";

import { BLOG_SOURCE_LEN_MAX, BLOG_SOURCES_MAX } from "@/lib/api/types";

export interface SourcesFieldProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function SourcesField({ value, onChange, disabled = false }: SourcesFieldProps) {
  const [expanded, setExpanded] = useState(value.length > 0);
  const atCap = value.length >= BLOG_SOURCES_MAX;

  const addEmpty = () => {
    if (atCap) return;
    onChange([...value, ""]);
  };

  const updateAt = (idx: number, next: string) => {
    const capped = next.slice(0, BLOG_SOURCE_LEN_MAX);
    onChange(value.map((s, i) => (i === idx ? capped : s)));
  };

  const removeAt = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = value.slice();
    [next[idx - 1], next[idx]] = [next[idx] as string, next[idx - 1] as string];
    onChange(next);
  };

  const moveDown = (idx: number) => {
    if (idx >= value.length - 1) return;
    const next = value.slice();
    [next[idx + 1], next[idx]] = [next[idx] as string, next[idx + 1] as string];
    onChange(next);
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        disabled={disabled}
        aria-expanded={expanded}
        className="bcc-mono flex items-center gap-2 self-start text-[10px] tracking-[0.18em] text-cardstock-deep hover:text-ink"
      >
        <span>{expanded ? "▾" : "▸"}</span>
        {value.length > 0 ? (
          <span>SOURCES · {value.length}/{BLOG_SOURCES_MAX}</span>
        ) : (
          <span>ADD SOURCES</span>
        )}
      </button>

      {expanded && (
        <div className="flex flex-col gap-2 rounded-sm border border-cardstock-edge/30 bg-cardstock/40 px-3 py-3">
          {value.length === 0 && (
            <p className="bcc-mono text-[10px] text-ink-soft">
              Numbered citations render at the post foot. URLs, paper
              titles, archived snapshots — any free-form reference.
            </p>
          )}

          {value.map((entry, idx) => {
            const len = entry.length;
            const overCap = len > BLOG_SOURCE_LEN_MAX;
            return (
              <div key={idx} className="flex items-start gap-2">
                <span className="bcc-mono mt-1 w-6 shrink-0 text-right text-[11px] tabular-nums text-ink-soft">
                  {idx + 1}.
                </span>
                <div className="flex-1">
                  <input
                    type="text"
                    value={entry}
                    onChange={(e) => updateAt(idx, e.target.value)}
                    placeholder="https://… or short reference"
                    maxLength={BLOG_SOURCE_LEN_MAX + 20}
                    disabled={disabled}
                    aria-label={`Source ${idx + 1}`}
                    className="bcc-mono w-full bg-transparent text-[12px] text-ink placeholder:text-ink-soft/60 focus:outline-none disabled:opacity-50"
                  />
                  <span
                    className={
                      "bcc-mono block text-[10px] " +
                      (overCap ? "text-safety" : "text-ink-soft/60")
                    }
                  >
                    {len} / {BLOG_SOURCE_LEN_MAX}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Move source ${idx + 1} up`}
                    onClick={() => moveUp(idx)}
                    disabled={disabled || idx === 0}
                    className="bcc-mono px-1 text-[12px] text-ink-soft hover:text-ink disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Move source ${idx + 1} down`}
                    onClick={() => moveDown(idx)}
                    disabled={disabled || idx >= value.length - 1}
                    className="bcc-mono px-1 text-[12px] text-ink-soft hover:text-ink disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove source ${idx + 1}`}
                    onClick={() => removeAt(idx)}
                    disabled={disabled}
                    className="bcc-mono px-1 text-[12px] text-ink-soft hover:text-safety"
                  >
                    ✕
                  </button>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addEmpty}
            disabled={disabled || atCap}
            className="bcc-mono self-start border border-dashed border-cardstock-edge/60 px-3 py-1 text-[10px] tracking-[0.18em] text-ink-soft hover:border-cardstock-edge hover:text-ink disabled:opacity-50"
          >
            {atCap ? "SOURCE LIMIT REACHED" : "+ ADD SOURCE"}
          </button>
        </div>
      )}
    </div>
  );
}
