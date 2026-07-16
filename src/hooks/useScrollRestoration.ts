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
 * puts it back on return.
 *
 * `positions` is a MODULE-level map, not a `useRef` — `(app)`/`(detail)`
 * are separate route groups (Item 7 split) that each mount their own
 * `AppShell`/`.bcc-col-center` instance, so navigating feed → post detail
 * unmounts one and mounts another. A `useRef`'s state dies with its
 * component instance, which would silently wipe scroll memory on every
 * such crossing — the module-level map survives remounts within the same
 * JS session (any live route group can read/write the same map) while
 * still resetting on a real page reload, since that reinitializes the
 * module. Was previously safe as a `useRef` back when `.bcc-col-center`
 * lived in one persistent `(main)` layout shared by every route.
 *
 * Mechanism:
 *   - A passive scroll listener continuously records the current path's
 *     scrollTop into the map (rAF-throttled).
 *   - On pathname change, a layout effect updates the "current path" ref
 *     synchronously (before the browser fires the clamp-scroll event that
 *     content-height changes trigger — otherwise that event would save the
 *     new page's scrollTop under the OLD path and wipe the feed position),
 *     then restores the incoming path's saved position next frame (after
 *     the route's content has committed and its height is measurable —
 *     React Query serves the cached feed synchronously, so full height is
 *     present immediately).
 */

import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { usePathname } from "next/navigation";

const positions = new Map<string, number>();

export function useScrollRestoration(ref: RefObject<HTMLElement | null>): void {
  const pathname = usePathname();
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
        positions.set(currentPath.current, el.scrollTop);
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
    const saved = positions.get(pathname) ?? 0;
    const raf = requestAnimationFrame(() => {
      el.scrollTop = saved;
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname, ref]);
}
