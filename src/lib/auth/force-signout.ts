/**
 * force-signout — the last-resort control offered when the ordinary
 * teardown could not finish.
 *
 * ## Why not `window.location.assign("/api/auth/signout")`
 *
 * Because it does not sign anything out. Two independent reasons, both
 * verified in this tree:
 *
 *  1. `src/middleware.ts` intercepts `GET /api/auth/signout` and redirects
 *     it to `/signout`, our styled page. Its own comment says it: "POST
 *     requests (the actual sign-out mechanism) pass through untouched."
 *  2. Even without that, next-auth v4's GET handler only RENDERS a
 *     confirmation page. The session is destroyed by the POST.
 *
 * So the button looked like an escape hatch and was cosmetic. Worse than
 * cosmetic: the document load it caused reset the module-level render gate
 * to open while the session cookie was still live, so the previous
 * viewer's server-rendered owner controls and email could come back on the
 * next navigation — on a shared machine, to someone who had just been told
 * they were signed out.
 *
 * ## What this does instead
 *
 * Submits a real form POST to `/api/auth/signout`, which is the mechanism
 * that clears the cookie. A form submission is a browser navigation rather
 * than a `fetch`, so it does not depend on the fetch path that just
 * failed. It still needs a CSRF token, which next-auth requires and
 * rejects the POST without (400).
 *
 * If the token cannot be obtained, it falls back to `/signout` — a real
 * page with a real control, which retries the teardown. That is a weaker
 * guarantee, so the caller's copy must not promise more than "this will
 * finish it".
 */

import { pendingAuthNotice } from "@/lib/auth/session-boundary";

/** Where the fallback lands. Our own page; it retries `endSession`. */
const FALLBACK_PATH = "/signout";


/**
 * How long to wait for a CSRF token before giving up on the POST.
 *
 * Load-bearing. The panel that offers this control exists because the
 * sign-out POST timed out or failed, and `/api/auth/csrf` is the SAME
 * route handler on the SAME host. If that host is wedged, this fetch hangs
 * too — and a hanging fetch never rejects, so without a bound the `catch`
 * below is unreachable and the button is silently dead. That is the exact
 * failure this module was written to remove, one layer out.
 */
const CSRF_TIMEOUT_MS = 3_000;

/**
 * Append the parked `authNotice` slug, if any, to a landing path. Both
 * `/` and `/signout` sit under layouts that mount `AuthRedirectNotice`,
 * so either will render it.
 */
function landingWithNotice(base: string): string {
  const slug = pendingAuthNotice();
  return slug === null ? base : `${base}?authNotice=${slug}`;
}

export async function forceSignOutNavigation(): Promise<void> {
  try {
    const resp = await fetch("/api/auth/csrf", {
      credentials: "include",
      // Rejects with a TimeoutError, which the catch turns into the
      // fallback navigation.
      signal: AbortSignal.timeout(CSRF_TIMEOUT_MS),
    });
    const body = (await resp.json()) as { csrfToken?: unknown };
    const csrfToken =
      typeof body.csrfToken === "string" && body.csrfToken !== ""
        ? body.csrfToken
        : null;
    if (csrfToken === null) {
      throw new Error("no csrf token");
    }

    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/api/auth/signout";
    // `callbackUrl` is built only from literals and a closed slug union,
    // so nothing viewer-supplied reaches here. The slug matters: this
    // control is the gate's only way out, and a teardown that failed
    // deliberately KEPT its parked notice for the retry — but the retry
    // is a document load, which destroys that module state, so the only
    // way the explanation survives is in the URL.
    for (const [name, value] of [
      ["csrfToken", csrfToken],
      ["callbackUrl", landingWithNotice("/")],
    ] as const) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    form.submit();
  } catch {
    // `/signout` runs its own teardown, so navigating there is a retry
    // with a fresh document. But that page sits inside the render gate and
    // can therefore BE the page showing this control — in which case
    // assigning the same path is a no-op loop. Reload instead: same fresh
    // document, same fresh teardown, no dead click.
    // Compare the full target, not just the path. Reloading is only the
    // right move when assigning would be a no-op; if a notice is parked,
    // `/signout?authNotice=...` is a REAL navigation from a bare
    // `/signout`, and reloading instead would destroy the module state
    // holding that notice before the next teardown could read it.
    const target = landingWithNotice(FALLBACK_PATH);
    const here = `${window.location.pathname}${window.location.search}`;
    if (target === here) {
      window.location.reload();
      return;
    }
    window.location.assign(target);
  }
}
