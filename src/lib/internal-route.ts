import type { Route } from "next";

/**
 * Narrow a server-provided URL to a typed internal <Link> route.
 *
 * The search view-models (projects `/v//p//c/`, users `/u/{handle}`,
 * groups) emit RELATIVE in-app routes. Passing those to `<Link href>`
 * requires an `as Route` cast (typedRoutes can't verify a runtime-dynamic
 * string) — but a bare cast gives zero protection against the regression
 * class that has bitten this surface twice: the server accidentally
 * emitting an absolute WP-origin permalink, which `<Link>` silently turns
 * into a full-page cross-origin navigation OFF the headless app.
 *
 * This centralises the cast behind a render-boundary tripwire: a
 * non-relative href warns loudly in development (so a server regression is
 * caught in testing, not in production), while the value is passed through
 * either way — the client can't reconstruct the correct route, and a
 * dead/rewritten link would be worse UX than the (now test-covered) server
 * contract holding.
 */
export function toInternalHref(url: string): Route {
  if (
    process.env.NODE_ENV !== "production" &&
    (url === "" || !url.startsWith("/"))
  ) {
    // eslint-disable-next-line no-console -- dev-only regression tripwire
    console.warn(
      `[bcc] search href is not a relative in-app route (got: ${JSON.stringify(url)}). ` +
        `The server view-model should emit /v//p//c/, /u/{handle}, or a group route.`,
    );
  }
  return url as Route;
}
