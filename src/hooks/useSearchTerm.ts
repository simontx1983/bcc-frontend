"use client";

/**
 * useSearchTerm — the debounced, length-gated term every search hook keys
 * its query on.
 *
 * Shared by useGlobalSearch (the header combobox) and the three /search
 * verticals, which each carried their own copy of this debounce before
 * F-260.
 *
 * Returns the trimmed input once typing has settled for DEBOUNCE_MS, or ""
 * while the input is shorter than SEARCH_MIN_LENGTH ("" keeps the query
 * disabled: the server enforces the same floor, so this gate is a
 * courtesy, not a contract).
 *
 * The FIRST value is the input itself, not "": a consumer that mounts
 * with a term already in hand (/search?q=… on load) fires at once instead
 * of rendering a disabled, not-loading query for one debounce window, the
 * window in which /search used to claim "no matches" (F-260 M9). Only
 * later changes wait for typing to settle.
 */

import { useEffect, useState } from "react";

/** Shortest term any search surface sends. Mirrors bcc-search's floor. */
export const SEARCH_MIN_LENGTH = 2;

const DEBOUNCE_MS = 200;

function settled(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.length >= SEARCH_MIN_LENGTH ? trimmed : "";
}

export function useSearchTerm(raw: string): string {
  const [term, setTerm] = useState<string>(() => settled(raw));

  useEffect(() => {
    const next = settled(raw);
    // Dropping under the floor clears at once (nothing to wait for);
    // only a real term waits for typing to settle.
    if (next === "") {
      setTerm("");
      return;
    }
    const t = window.setTimeout(() => setTerm(next), DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [raw]);

  return term;
}
