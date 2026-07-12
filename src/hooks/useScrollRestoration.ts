"use client";

/**
 * useScrollRestoration — per-path scroll memory for an inner scroll
 * container.
 *
 * The app shell scrolls inside `.bcc-col-center` (an `overflow-y:auto`
 * column), not the window — `body` is `overflow:hidden`. Next.js only
 * restores the *window* scroll on back/forward nav, so it has nothing to
 * restore here and every soft-nav back to the feed landed at the top.
 *
 * This hook makes the column remember where each route was scrolled and
 * puts it back on return. It works because `.bcc-col-center` lives in the
 * persistent `(main)` layout, so the element (and this hook's state)
 * survive navigation between the feed and `/post/[id]`.
 *
 * Mechanism:
 *   - A passive scroll listener continuously records the current path's
 *     scrollTop into an in-memory map (rAF-throttled).
 *   - On pathname change, a layout effect updates the "current path" ref
 *     synchronously (before the browser fires the clamp-scroll event that
 *     content-height changes trigger — otherwise that event would save the
 *     new page's scrollTop under the OLD path and wipe the feed position),
 *     then restores the incoming path's saved position next frame (after
 *     the route's content has committed and its height is measurable —
 *     React Query serves the cached feed synchronously, so full height is
 *     present immediately).
 *
 * In-memory (not sessionStorage) is deliberate: this is for SPA back-nav,
 * which is the only case where the container persists. A full reload
 * remounts the shell and legitimately starts at the top.
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { usePathname } from "next/navigation";

export function useScrollRestoration(ref: RefObject<HTMLElement | null>): void {
  const pathname = usePathname();
  const positions = useRef<Map<string, number>>(new Map());
  // Tracks which path the scroll listener should attribute saves to.
  // Kept in sync via the layout effect below so it's correct BEFORE any
  // post-navigation scroll event fires.
  const currentPath = useRef(pathname);

  // Continuously record the active path's scroll position.
  useEffect(() => {
    const el = ref.current;
    if (el === null) return undefined;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        positions.current.set(currentPath.current, el.scrollTop);
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [ref]);

  // On route change: retarget saves to the new path (synchronously), then
  // restore that path's remembered position once its content has laid out.
  useLayoutEffect(() => {
    currentPath.current = pathname;
    const el = ref.current;
    if (el === null) return undefined;
    const saved = positions.current.get(pathname) ?? 0;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = saved;
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname, ref]);
}
