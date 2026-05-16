"use client";

/**
 * BodyEditor — split-view markdown editor for the blog composer.
 *
 * Layout modes:
 *   - `compose` — textarea only (mobile default)
 *   - `preview` — rendered markdown only (full visual check)
 *   - `both` — side-by-side textarea + preview (desktop default)
 *
 * Preview rendering is debounced at 150ms so the compose pane stays
 * responsive at native typing speed on long posts.
 *
 * Auto-save: the body string is persisted to localStorage every 5
 * seconds under `bcc.blog.draft.{userId}`. The composer is the
 * canonical reader of that key; this component just writes it. On a
 * successful submit the composer clears the key.
 *
 * Excerpt is a separate field on the composer, NOT in this editor.
 * The excerpt textarea is small + bounded; the body is the unbounded
 * markdown surface.
 */

import { useEffect, useState } from "react";

import { BLOG_FULL_TEXT_MAX_LENGTH } from "@/lib/api/types";

import { BlogMarkdownRenderer } from "./markdown/BlogMarkdownRenderer";

type EditorMode = "compose" | "preview" | "both";

export interface BodyEditorProps {
  value: string;
  onChange: (next: string) => void;
  /**
   * localStorage key for auto-save. The composer derives this from
   * the signed-in user's id; the editor doesn't compute it.
   */
  autosaveKey?: string;
  disabled?: boolean;
}

export function BodyEditor({
  value,
  onChange,
  autosaveKey,
  disabled = false,
}: BodyEditorProps) {
  const [mode, setMode] = useState<EditorMode>("both");
  const [previewSrc, setPreviewSrc] = useState(value);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  // Debounce preview update.
  useEffect(() => {
    const id = window.setTimeout(() => setPreviewSrc(value), 150);
    return () => window.clearTimeout(id);
  }, [value]);

  // Auto-save body to localStorage every 5s when the key is provided.
  useEffect(() => {
    if (autosaveKey === undefined || autosaveKey === "") return;
    const id = window.setInterval(() => {
      try {
        window.localStorage.setItem(autosaveKey, value);
        setSavedAt(Date.now());
      } catch {
        // Quota / disabled storage — silent failure; the writer can
        // still publish, just no offline recovery.
      }
    }, 5000);
    return () => window.clearInterval(id);
  }, [autosaveKey, value]);

  const len = value.length;
  const overCap = len > BLOG_FULL_TEXT_MAX_LENGTH;
  const tone = overCap
    ? "text-safety"
    : len > BLOG_FULL_TEXT_MAX_LENGTH - 1000
      ? "text-warning"
      : "text-ink-soft";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
          BODY · MARKDOWN <span className="text-safety">*</span>
        </span>
        <div role="tablist" aria-label="Editor mode" className="flex items-center gap-1">
          {(["compose", "preview", "both"] as const).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(m)}
                className={
                  "bcc-mono shrink-0 border px-2 py-1 text-[10px] tracking-[0.18em] transition " +
                  (active
                    ? "border-safety text-safety"
                    : "border-transparent text-cardstock-deep hover:border-cardstock-edge/60 hover:text-cardstock")
                }
              >
                {m.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div
        className={
          "flex gap-3 " +
          (mode === "both" ? "flex-col lg:flex-row" : "flex-col")
        }
      >
        {(mode === "compose" || mode === "both") && (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              // Tab inserts two spaces instead of changing focus —
              // markdown lists / code blocks need it. Shift-Tab still
              // defocuses for keyboard nav.
              if (e.key === "Tab" && !e.shiftKey) {
                e.preventDefault();
                const t = e.currentTarget;
                const start = t.selectionStart;
                const end = t.selectionEnd;
                const next = value.slice(0, start) + "  " + value.slice(end);
                onChange(next);
                // Restore cursor after the inserted spaces on next tick.
                requestAnimationFrame(() => {
                  t.selectionStart = t.selectionEnd = start + 2;
                });
              }
            }}
            placeholder="Write your post in markdown. # Headings, **bold**, ```solidity code blocks```, @handles, $validator:akashvalop1…, ENS names, and 0x… tx hashes all render natively."
            rows={20}
            maxLength={BLOG_FULL_TEXT_MAX_LENGTH + 1000}
            disabled={disabled}
            className="bcc-mono w-full flex-1 resize-y rounded-sm border border-cardstock-edge/30 bg-cardstock/40 px-3 py-2 text-[13px] leading-relaxed text-ink placeholder:text-ink-soft/60 focus:border-blueprint focus:outline-none disabled:opacity-60"
            style={{ minHeight: "320px" }}
          />
        )}

        {(mode === "preview" || mode === "both") && (
          <div
            className="flex-1 overflow-y-auto rounded-sm border border-cardstock-edge/30 bg-cardstock-deep/20 px-4 py-3"
            style={{ minHeight: "320px", maxHeight: mode === "preview" ? "70vh" : "auto" }}
          >
            {previewSrc.trim() === "" ? (
              <p className="bcc-mono text-[11px] text-ink-soft">
                Live preview renders here.
              </p>
            ) : (
              <BlogMarkdownRenderer body={previewSrc} />
            )}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="bcc-mono text-[10px] text-ink-soft">
          {savedAt !== null ? `Auto-saved ${formatAgo(savedAt)}` : "Auto-save runs every 5s"}
        </span>
        <span className={`bcc-mono text-[10px] ${tone}`}>
          {len.toLocaleString()} / {BLOG_FULL_TEXT_MAX_LENGTH.toLocaleString()}
          {overCap && (
            <span className="ml-2">(over by {(len - BLOG_FULL_TEXT_MAX_LENGTH).toLocaleString()})</span>
          )}
        </span>
      </div>
    </div>
  );
}

function formatAgo(ms: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  return `${hr}h ago`;
}
