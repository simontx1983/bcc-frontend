"use client";

/**
 * TagsInput — free-form 0..5 tag pills for the blog composer.
 *
 * Type to add; comma or Enter commits the current draft as a pill.
 * Backspace on empty input removes the last pill. Click ✕ on a pill
 * to remove. Pills are normalized: lowercased, trimmed, alnum + dash
 * only, capped at `BLOG_TAG_LEN_MAX` chars. Duplicates silently
 * dropped.
 *
 * Cap enforced at `BLOG_TAGS_MAX` (5). The input itself is disabled
 * once the cap is reached so the writer can't even type a 6th.
 */

import { useState } from "react";

import { BLOG_TAG_LEN_MAX, BLOG_TAGS_MAX } from "@/lib/api/types";

export interface TagsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

function normalizeTag(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, BLOG_TAG_LEN_MAX);
}

export function TagsInput({ value, onChange, disabled = false }: TagsInputProps) {
  const [draft, setDraft] = useState("");
  const atCap = value.length >= BLOG_TAGS_MAX;

  const commit = (candidate: string) => {
    const tag = normalizeTag(candidate);
    if (tag === "") return;
    if (value.includes(tag)) {
      setDraft("");
      return;
    }
    if (value.length >= BLOG_TAGS_MAX) return;
    onChange([...value, tag]);
    setDraft("");
  };

  const remove = (tag: string) => {
    onChange(value.filter((t) => t !== tag));
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
        TAGS · {value.length}/{BLOG_TAGS_MAX}
      </span>
      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-cardstock-edge/30 bg-cardstock/40 px-2 py-2">
        {value.map((tag) => (
          <span
            key={tag}
            className="bcc-mono inline-flex items-center gap-2 border border-cardstock-edge bg-cardstock-deep/10 px-2 py-1 text-[11px] tracking-[0.12em] text-ink"
          >
            #{tag}
            <button
              type="button"
              aria-label={`Remove tag ${tag}`}
              onClick={() => remove(tag)}
              disabled={disabled}
              className="text-ink-soft hover:text-safety"
            >
              ✕
            </button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            const v = e.target.value;
            if (v.endsWith(",") || v.endsWith(" ")) {
              commit(v.slice(0, -1));
            } else {
              setDraft(v.slice(0, BLOG_TAG_LEN_MAX + 5));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
            } else if (e.key === "Backspace" && draft === "" && value.length > 0) {
              remove(value[value.length - 1] as string);
            }
          }}
          onBlur={() => commit(draft)}
          placeholder={atCap ? "Tag limit reached" : "Add a tag, then comma"}
          disabled={disabled || atCap}
          className="bcc-mono min-w-[8ch] flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-soft/60 focus:outline-none disabled:opacity-50"
        />
      </div>
    </div>
  );
}
