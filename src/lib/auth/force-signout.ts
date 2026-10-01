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

/** Where the fallback lands. Our own page; it retries `endSession`. */
const FALLBACK_PATH = "/signout";

export async function forceSignOutNavigation(): Promise<void> {
  try {
    const resp = await fetch("/api/auth/csrf", { credentials: "include" });
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
    // `callbackUrl` is a literal: nothing viewer-supplied reaches here.
    for (const [name, value] of [
      ["csrfToken", csrfToken],
      ["callbackUrl", "/"],
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
    window.location.assign(FALLBACK_PATH);
  }
}
