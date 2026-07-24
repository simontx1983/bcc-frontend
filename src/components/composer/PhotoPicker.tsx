"use client";

/**
 * PhotoPicker — the inline composer's attached-photo preview tile +
 * remove affordance + §3.3.9 alt-text editor. Extracted from
 * Composer.tsx (Phase 3.3 god-component split); markup and behavior
 * unchanged. Fully controlled — the photo/alt state lives in
 * useComposerState and is threaded through props, so this stays a
 * presentation-only sibling of GifPicker.
 */

import { PHOTO_ALT_MAX_LENGTH } from "@/lib/api/types";

interface PhotoPickerProps {
  /** Transient `URL.createObjectURL()` for the thumbnail tile. */
  previewUrl: string;
  /** §3.3.9 author-supplied alt text (controlled). */
  altText: string;
  onAltTextChange: (next: string) => void;
  /** Clears the photo + preview + alt as one logical state. */
  onRemove: () => void;
  /** True while a composer write is in flight. */
  disabled: boolean;
}

export function PhotoPicker({
  previewUrl,
  altText,
  onAltTextChange,
  onRemove,
  disabled,
}: PhotoPickerProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="relative inline-flex w-fit">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt=""
          decoding="async"
          className="h-24 w-24 rounded-sm border border-cardstock-edge/40 object-cover"
        />
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove photo"
          className="bcc-mono absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full border border-cardstock-edge/60 bg-ink text-[10px] leading-none text-cardstock hover:bg-safety hover:text-cardstock"
          title="Remove photo"
        >
          ×
        </button>
      </div>
      {/*
        §3.3.9 / §4.18 alt-text input — author-supplied screen-reader
        description for the photo. Optional; chained POST after the
        photo upload via useSetPhotoAltMutation. Server applies the
        same 500-char cap and HTML stripping.
      */}
      <label className="bcc-mono flex flex-col gap-1 text-[11px] text-bcc-text-secondary">
        <span>
          Describe this photo{" "}
          <span className="text-bcc-text-secondary">(optional, helps screen readers)</span>
        </span>
        <textarea
          id="composer-photo-alt"
          aria-describedby="composer-photo-alt-counter"
          value={altText}
          onChange={(event) => onAltTextChange(event.target.value)}
          maxLength={PHOTO_ALT_MAX_LENGTH}
          rows={2}
          disabled={disabled}
          className="font-serif resize-y rounded-sm border border-bcc-input-border bg-bcc-input-bg px-2 py-1 text-[13px] leading-snug text-bcc-text placeholder:text-bcc-text-placeholder focus-visible:border-bcc-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-bcc-accent disabled:opacity-50"
          placeholder="e.g. Phillip standing under the BCC banner holding the demo board."
        />
        {/*
          Live region is unconditionally mounted so AT engines
          hook up at component mount; the visible-state toggle
          rides on `hidden` (not conditional render) so the
          threshold-cross is reliably announced.
        */}
        <span
          id="composer-photo-alt-counter"
          aria-live="polite"
          hidden={altText.length < PHOTO_ALT_MAX_LENGTH - 50}
          className={
            altText.length > PHOTO_ALT_MAX_LENGTH
              ? "text-safety"
              : "text-bcc-text-secondary"
          }
        >
          {altText.length}/{PHOTO_ALT_MAX_LENGTH}
        </span>
      </label>
    </div>
  );
}
