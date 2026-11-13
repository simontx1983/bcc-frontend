"use client";

/**
 * Scrolls to the URL's #fragment once that element exists. The reviews
 * list renders client-side, so on a cold load the target is not in the
 * DOM when the browser (or Next) tries the hash scroll. Watches for it
 * for a few seconds, scrolls once, then stops. Jump, not smooth — no
 * motion to reduce.
 */

import { useEffect } from "react";

const GIVE_UP_MS = 8_000;

export function ScrollToHashOnArrival() {
  useEffect(() => {
    let id = window.location.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // A malformed escape: use the raw fragment.
    }
    if (id === "") return;

    const tryScroll = (): boolean => {
      const el = document.getElementById(id);
      if (el === null) return false;
      el.scrollIntoView({ block: "start" });
      return true;
    };
    if (tryScroll()) return;

    const observer = new MutationObserver(() => {
      if (tryScroll()) cleanup();
    });
    const timer = window.setTimeout(() => cleanup(), GIVE_UP_MS);
    function cleanup() {
      observer.disconnect();
      window.clearTimeout(timer);
    }
    observer.observe(document.body, { childList: true, subtree: true });
    return cleanup;
  }, []);

  return null;
}
