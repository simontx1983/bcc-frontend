"use client";

/**
 * useCopyConfirm — writes text to the clipboard and exposes a brief
 * "copied" flag that auto-resets. Shared by the feed card's overflow
 * "Copy link" action and its share-button clipboard fallback so both
 * reuse the same confirmation idiom instead of each rolling their own
 * timeout state.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/** `document.execCommand` fallback for origins where `navigator.clipboard` is unavailable. */
function legacyCopy(text: string): boolean {
  const el = document.createElement("textarea");
  el.value = text;
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  el.focus();
  el.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  document.body.removeChild(el);
  return ok;
}

export function useCopyConfirm(durationMs = 1400) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = useCallback(
    async (text: string) => {
      let ok = false;
      try {
        await navigator.clipboard.writeText(text);
        ok = true;
      } catch {
        // navigator.clipboard is undefined (insecure-context origins other
        // than localhost — e.g. a LAN IP / tunnelled dev origin) or the
        // write itself threw. Fall back to the classic hidden-textarea +
        // execCommand copy so the action still works there.
        ok = legacyCopy(text);
      }
      if (!ok) return false;
      setCopied(true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), durationMs);
      return true;
    },
    [durationMs]
  );

  return { copied, copy };
}
