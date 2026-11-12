"use client";

/**
 * A "sign in, then come back here" link that keeps the WHOLE current
 * address — path and query, so `?tab=reviews` survives sign-in — and only
 * ever as a same-origin relative path (safeCallbackPath).
 *
 * `href` is built from the pathname, so it renders the same on the server
 * and works for middle-click / open-in-new-tab. `onClick` re-reads the
 * live location at the moment of the click (query included) and navigates
 * there with a full load (it is the sign-in page). Reading `window.location`
 * at click time, rather than `useSearchParams()` / `useRouter()`, keeps this
 * usable inside every card grid without forcing a Suspense boundary onto
 * statically rendered pages, or an app-router context onto every test.
 *
 * Used by the F-321 sign-in affordances (VOUCH, WRITE A REVIEW, JOIN HALL
 * and the trading-card pills).
 */

import type { Route } from "next";
import { usePathname } from "next/navigation";
import type { MouseEvent } from "react";

import { safeCallbackPath } from "@/lib/auth/safe-callback";

/** `/login?callbackUrl=<path>`, or plain `/login` when `path` isn't safe. */
export function signInHref(path: string): Route {
  const safe = safeCallbackPath(path);
  return (safe === null ? "/login" : `/login?callbackUrl=${encodeURIComponent(safe)}`) as Route;
}

export function useSignInLink(fallbackPath = "/"): {
  href: Route;
  onClick: (event: MouseEvent<HTMLAnchorElement>) => void;
} {
  const pathname = usePathname();
  const href = signInHref(pathname ?? fallbackPath);

  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    // Inside a trading card the body is a link too: never let it navigate.
    event.stopPropagation();
    // A modified click (new tab / window) keeps the plain href.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    if (typeof window === "undefined") return;
    event.preventDefault();
    window.location.assign(signInHref(`${window.location.pathname}${window.location.search}`));
  };

  return { href, onClick };
}
