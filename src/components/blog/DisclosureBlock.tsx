"use client";

/**
 * DisclosureBlock — collapsible structured disclosure for the composer.
 *
 * §D6 disclosure spec: `{tickers: string[], note: string}`. Empty
 * disclosure (no tickers AND no note) → composer sends `null` on
 * submit (CLEARS the disclosure server-side, distinct from "leave
 * unchanged" semantics). Server rejects an empty struct as
 * `bcc_invalid_request`, so the composer normalizes before submit.
 *
 * Collapsed by default — disclosure is opt-in but visible. The
 * toggle button label changes from "ADD DISCLOSURE" to
 * "DISCLOSURE: N TICKERS + NOTE" once populated, so the writer sees
 * at a glance whether they've declared anything.
 *
 * §A2 server-pinned strings: validation error messages come from
 * the backend (`bcc_invalid_request` envelope); this component only
 * provides client-side bounds-check hints, no synthesized copy.
 */

import { useState } from "react";

import {
  BLOG_DISCLOSURE_NOTE_MAX,
  BLOG_DISCLOSURE_TICKER_LEN_MAX,
  BLOG_DISCLOSURE_TICKERS_MAX,
  type BlogDisclosure,
} from "@/lib/api/types";

export interface DisclosureBlockProps {
  /**
   * Current value. `null` means "no disclosure declared." A populated
   * struct means the writer has typed something; the composer is
   * responsible for normalizing back to `null` on submit if both
   * `tickers` and `note` are empty.
   */
  value: BlogDisclosure | null;
  onChange: (next: BlogDisclosure | null) => void;
  disabled?: boolean;
}

function normalizeTicker(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, BLOG_DISCLOSURE_TICKER_LEN_MAX);
}

export function DisclosureBlock({ value, onChange, disabled = false }: DisclosureBlockProps) {
  const [expanded, setExpanded] = useState(value !== null);
  const [tickerDraft, setTickerDraft] = useState("");

  const tickers = value?.tickers ?? [];
  const note = value?.note ?? "";
  const populated = tickers.length > 0 || note.trim() !== "";

  const update = (next: { tickers?: string[]; note?: string }) => {
    onChange({
      tickers: next.tickers ?? tickers,
      note:    next.note ?? note,
    });
  };

  const commitTicker = (raw: string) => {
    const t = normalizeTicker(raw);
    if (t === "") return;
    if (tickers.includes(t)) {
      setTickerDraft("");
      return;
    }
    if (tickers.length >= BLOG_DISCLOSURE_TICKERS_MAX) return;
    update({ tickers: [...tickers, t] });
    setTickerDraft("");
  };

  const removeTicker = (t: string) => {
    update({ tickers: tickers.filter((x) => x !== t) });
  };

  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        disabled={disabled}
        aria-expanded={expanded}
        className="bcc-mono inline-flex items-center gap-2 self-start text-[10px] tracking-[0.18em] text-cardstock-deep hover:text-cardstock"
      >
        <span>{expanded ? "▾" : "▸"}</span>
        <span>
          {populated
            ? `DISCLOSURE · ${tickers.length} TICKER${tickers.length === 1 ? "" : "S"}${note.trim() !== "" ? " + NOTE" : ""}`
            : "ADD DISCLOSURE"}
        </span>
      </button>

      {expanded && (
        <div className="flex flex-col gap-3 rounded-sm border border-cardstock-edge/30 bg-cardstock/40 p-3">
          <p className="font-serif text-sm text-ink-soft">
            Tickers and a brief note disclosing any positions
            relevant to this post. Renders as a fixed footer aside.
            Leave both blank if you have nothing to disclose.
          </p>

          {/* Tickers */}
          <div className="flex flex-col gap-1">
            <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
              TICKERS · {tickers.length}/{BLOG_DISCLOSURE_TICKERS_MAX}
            </span>
            <div className="flex flex-wrap items-center gap-2 rounded-sm border border-cardstock-edge/30 bg-cardstock/30 px-2 py-2">
              {tickers.map((t) => (
                <span
                  key={t}
                  className="bcc-mono inline-flex items-center gap-2 border border-cardstock-edge bg-cardstock-deep/10 px-2 py-1 text-[11px] tracking-[0.12em] text-ink"
                >
                  {t}
                  <button
                    type="button"
                    aria-label={`Remove ticker ${t}`}
                    onClick={() => removeTicker(t)}
                    disabled={disabled}
                    className="text-ink-soft hover:text-safety"
                  >
                    ✕
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={tickerDraft}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.endsWith(",") || v.endsWith(" ")) {
                    commitTicker(v.slice(0, -1));
                  } else {
                    setTickerDraft(v.slice(0, BLOG_DISCLOSURE_TICKER_LEN_MAX + 5));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") {
                    e.preventDefault();
                    commitTicker(tickerDraft);
                  } else if (
                    e.key === "Backspace" &&
                    tickerDraft === "" &&
                    tickers.length > 0
                  ) {
                    removeTicker(tickers[tickers.length - 1] as string);
                  }
                }}
                onBlur={() => commitTicker(tickerDraft)}
                placeholder={
                  tickers.length >= BLOG_DISCLOSURE_TICKERS_MAX
                    ? "Limit reached"
                    : "BTC, ETH, AKT…"
                }
                disabled={disabled || tickers.length >= BLOG_DISCLOSURE_TICKERS_MAX}
                className="bcc-mono min-w-[8ch] flex-1 bg-transparent text-[12px] text-ink placeholder:text-ink-soft/60 focus:outline-none disabled:opacity-50"
              />
            </div>
          </div>

          {/* Note */}
          <label className="flex flex-col gap-1">
            <span className="bcc-mono text-[10px] tracking-[0.18em] text-cardstock-deep">
              NOTE · {note.length}/{BLOG_DISCLOSURE_NOTE_MAX}
            </span>
            <textarea
              value={note}
              onChange={(e) =>
                update({ note: e.target.value.slice(0, BLOG_DISCLOSURE_NOTE_MAX + 50) })
              }
              placeholder="Author holds positions in… / no conflicts to declare."
              rows={3}
              disabled={disabled}
              className="bcc-mono w-full resize-y rounded-sm border border-cardstock-edge/30 bg-cardstock/30 px-3 py-2 text-[12px] text-ink placeholder:text-ink-soft/60 focus:border-blueprint focus:outline-none disabled:opacity-60"
            />
          </label>

          {populated && (
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled}
              className="bcc-mono self-start text-[10px] tracking-[0.18em] text-safety hover:underline underline-offset-4"
            >
              CLEAR DISCLOSURE
            </button>
          )}
        </div>
      )}
    </section>
  );
}
