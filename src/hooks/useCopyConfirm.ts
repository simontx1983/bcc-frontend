"use client";

/**
 * useCopyConfirm — writes text to the clipboard and exposes a brief
 * "copied" flag that auto-resets. Shared by the feed card's overflow
 * "Copy link" action and its share-button clipboard fallback so both
 * reuse the same confirmation idiom instead of each rolling their own
 * timeout state.
 */

import { useCallback, useEffect, useRef, useState } from "react";

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
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return false;
      }
      setCopied(true);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => setCopied(false), durationMs);
      return true;
    },
    [durationMs]
  );

  return { copied, copy };
}
