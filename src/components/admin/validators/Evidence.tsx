"use client";

/**
 * Staff evidence on the validator admin screens (security D5).
 *
 * `evidence_note` and `evidence_ref` render as React TEXT children only —
 * never HTML, never an <a>, never linkified, whatever they contain.
 * `evidence_ref` gets a Copy button instead of a link.
 *
 * Copy feedback belongs to the surface, not each button: one status
 * region speaks for the most recent copy (the WalletsSection pattern).
 * `useEvidenceRefCopy` holds that outcome; the caller renders the line.
 */

import { useEffect, useState } from "react";

import { useCopyConfirm } from "@/hooks/useCopyConfirm";

export function EvidenceNote({ note }: { note: string }) {
  return (
    // Text node only — never HTML, never linkified (D5).
    <p className="whitespace-pre-wrap break-words font-serif text-bcc-text">{note}</p>
  );
}

export interface EvidenceRefProps {
  value: string;
  /** The Copy button's accessible name, e.g. "Copy evidence reference for entry #4". */
  copyLabel: string;
  onCopy: () => void;
}

export function EvidenceRef({ value, copyLabel, onCopy }: EvidenceRefProps) {
  return (
    <span className="flex flex-wrap items-start gap-2">
      {/* Text node only — a URL here is NOT a link (D5). */}
      <code className="bcc-mono min-w-0 flex-1 break-all text-[11px] text-bcc-text">{value}</code>
      <button
        type="button"
        onClick={onCopy}
        aria-label={copyLabel}
        className="bcc-mono min-h-[44px] shrink-0 border-2 border-bcc-border px-3 py-1.5 text-[11px] tracking-[0.18em] text-bcc-text-secondary transition hover:border-bcc-border-strong hover:text-bcc-text"
      >
        Copy
      </button>
    </span>
  );
}

export interface EvidenceCopyOutcome<K> {
  key: K;
  ok: boolean;
}

/**
 * Writes an evidence reference to the clipboard and remembers the outcome
 * for the surface's one status line. A success clears with the copy
 * confirmation; a failure stays until the next copy.
 */
export function useEvidenceRefCopy<K>() {
  const { copied, copy } = useCopyConfirm();
  const [outcome, setOutcome] = useState<EvidenceCopyOutcome<K> | null>(null);
  useEffect(() => {
    if (!copied && outcome?.ok === true) setOutcome(null);
  }, [copied, outcome]);

  async function copyRef(key: K, ref: string) {
    const ok = await copy(ref);
    setOutcome({ key, ok });
  }

  return {
    outcome,
    copyRef: (key: K, ref: string) => void copyRef(key, ref),
  };
}
