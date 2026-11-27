"use client";

import { useSyncExternalStore } from "react";

/**
 * Touch only: the device has some coarse pointer and no fine one — a phone
 * or a tablet without a trackpad. Moved here from MessageComposer (M-me3,
 * where Enter inserts a newline on touch-only devices) so the "Open in
 * wallet app" step can use the same signal (§11).
 */
const COARSE_POINTER = "(any-pointer: coarse)";
const FINE_POINTER = "(any-pointer: fine)";

export function readTouchOnly(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(COARSE_POINTER).matches && !window.matchMedia(FINE_POINTER).matches;
}

function subscribeToPointers(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const lists = [window.matchMedia(COARSE_POINTER), window.matchMedia(FINE_POINTER)];
  for (const list of lists) list.addEventListener?.("change", onChange);
  return () => {
    for (const list of lists) list.removeEventListener?.("change", onChange);
  };
}

/**
 * Live, so plugging a trackpad into a tablet switches it back.
 * The server snapshot is "not touch only": the markup a desktop expects.
 */
export function useTouchOnly(): boolean {
  return useSyncExternalStore(subscribeToPointers, readTouchOnly, () => false);
}
