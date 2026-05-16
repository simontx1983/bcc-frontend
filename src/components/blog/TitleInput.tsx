"use client";

/**
 * TitleInput — single-line title field for the blog composer.
 *
 * Required by the V1 composer. Cap is `BLOG_TITLE_MAX_LENGTH` (120
 * chars). Renders the char counter in mono-spaced style matching the
 * other field counters in the composer.
 */

import { BLOG_TITLE_MAX_LENGTH } from "@/lib/api/types";

export interface TitleInputProps {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}

export function TitleInput({ value, onChange, disabled = false }: TitleInputProps) {
  const len = value.length;
  const overCap = len > BLOG_TITLE_MAX_LENGTH;
  const tone = overCap
    ? "text-safety"
    : len > BLOG_TITLE_MAX_LENGTH - 20
      ? "text-warning"
      : "text-ink-soft";

  return (
    <label className="flex flex-col gap-1">
      <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
        TITLE <span className="text-safety">*</span>
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="What is this post about?"
        maxLength={BLOG_TITLE_MAX_LENGTH + 20}
        disabled={disabled}
        className="bcc-stencil w-full rounded-sm border border-cardstock-edge/30 bg-cardstock/40 px-3 py-2 text-2xl text-ink placeholder:text-ink-soft/60 placeholder:font-serif placeholder:text-base focus:border-blueprint focus:outline-none disabled:opacity-60"
      />
      <span className={`bcc-mono self-end text-[10px] ${tone}`}>
        {len} / {BLOG_TITLE_MAX_LENGTH}
      </span>
    </label>
  );
}