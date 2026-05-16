"use client";

/**
 * CoverImageUpload — drag-drop or click cover-image uploader.
 *
 * Posts the file to `/bcc/v1/blog/cover-image` via
 * `uploadBlogCoverImage()`. On success, stores the returned
 * attachment_id + url in composer state. Shows the preview inline.
 *
 * Validation client-side mirrors the server caps:
 *   - mime ∈ {image/jpeg, image/png, image/webp, image/gif}
 *   - size ≤ 8 MB (BLOG_COVER_MAX_BYTES)
 *
 * Server-side rate limit is 5 uploads/60s/user — we add a basic
 * spam guard by disabling the input while an upload is in flight.
 *
 * "Remove" sets the composer's `cover_image_id` to `0`. On next
 * submit, the server treats `cover_image_id: 0` as un-pin.
 */

import { useState } from "react";
import Image from "next/image";

import { uploadBlogCoverImage } from "@/lib/api/blog-endpoints";
import { humanizeCode } from "@/lib/api/errors";

// Code→copy map for cover-upload failures. Per Phase γ doctrine,
// presentation copy is owned at the call site, never derived from
// `err.message`. New server codes that surface here get added below.
const COVER_UPLOAD_COPY: Record<string, string> = {
  bcc_unauthorized:   "Sign in to upload a cover image.",
  bcc_invalid_request: "Cover image is missing, oversized, or in an unsupported format.",
  bcc_rate_limited:   "Slow down — too many uploads in a short window.",
  bcc_unavailable:    "Upload service is temporarily unavailable.",
};

const BLOG_COVER_MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export interface CoverImageValue {
  attachment_id: number;
  url: string;
  width: number;
  height: number;
}

export interface CoverImageUploadProps {
  value: CoverImageValue | null;
  /**
   * Called with the uploaded payload on success or `null` when the
   * writer clears the cover. The composer stores `attachment_id` and
   * passes it through on submit.
   */
  onChange: (next: CoverImageValue | null) => void;
  disabled?: boolean;
}

export function CoverImageUpload({ value, onChange, disabled = false }: CoverImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = async (file: File) => {
    setError(null);

    if (!ALLOWED_MIMES.has(file.type)) {
      setError("Cover image must be JPEG, PNG, WebP, or GIF.");
      return;
    }
    if (file.size > BLOG_COVER_MAX_BYTES) {
      setError("Cover image must be 8 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const res = await uploadBlogCoverImage(file);
      onChange({
        attachment_id: res.attachment_id,
        url: res.url,
        width: res.width,
        height: res.height,
      });
    } catch (err) {
      setError(humanizeCode(err, COVER_UPLOAD_COPY, "Upload failed — try again in a moment."));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
        COVER IMAGE
      </span>

      {value !== null ? (
        <div className="flex flex-col gap-2">
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-sm border border-cardstock-edge/30 bg-cardstock/20">
            <Image
              src={value.url}
              alt="Cover image preview"
              fill
              sizes="(max-width: 768px) 100vw, 800px"
              className="object-cover"
              unoptimized
            />
          </div>
          <button
            type="button"
            onClick={() => {
              onChange(null);
              setError(null);
            }}
            disabled={disabled || uploading}
            className="bcc-mono self-start text-[10px] tracking-[0.18em] text-safety hover:underline underline-offset-4"
          >
            REMOVE COVER
          </button>
        </div>
      ) : (
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file !== undefined) {
              void handleFile(file);
            }
          }}
          className={
            "flex aspect-[16/9] w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-sm border-2 border-dashed transition " +
            (dragOver
              ? "border-safety bg-cardstock/50"
              : "border-cardstock-edge/30 bg-cardstock/30 hover:border-cardstock-edge")
          }
        >
          <input
            type="file"
            accept={Array.from(ALLOWED_MIMES).join(",")}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file !== undefined) {
                void handleFile(file);
              }
              // Reset so re-picking the same file fires onChange again.
              e.target.value = "";
            }}
            disabled={disabled || uploading}
            className="hidden"
          />
          <span
            className="bcc-mono text-[11px] tracking-[0.18em] text-cardstock-deep"
          >
            {uploading ? "UPLOADING…" : "DROP A COVER OR CLICK TO PICK"}
          </span>
          <span className="bcc-mono text-[10px] text-ink-soft">
            JPEG · PNG · WebP · GIF · up to 8 MB
          </span>
        </label>
      )}

      {error !== null && (
        <p role="alert" className="bcc-mono text-[11px] text-safety">
          {error}
        </p>
      )}
    </div>
  );
}
