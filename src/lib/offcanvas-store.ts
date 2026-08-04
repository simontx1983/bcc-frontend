"use client";

/**
 * Tiny external store for the mobile offcanvas's open/close state.
 *
 * Normally owned entirely by MobileShell (hamburger opens it, scrim/links
 * close it). It's lifted out to a module-scoped store — rather than local
 * useState — so the tour engine can also drive it: the "Your watchlist
 * lives here" step (tour/registry.ts, nav.watching) needs the offcanvas
 * open to target the Watching link, which only exists in the DOM in an
 * on-screen position while the panel is open on mobile.
 */

type Listener = () => void;

let open = false;
const listeners = new Set<Listener>();

export function getOffcanvasOpen(): boolean {
  return open;
}

export function setOffcanvasOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  listeners.forEach((listener) => listener());
}

export function subscribeOffcanvasOpen(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
