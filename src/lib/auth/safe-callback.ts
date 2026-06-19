import type { Route } from "next";

/**
 * Returns `raw` as a typed internal Route only if it is a safe same-origin
 * path: a single leading "/", not protocol-relative ("//"), and free of
 * backslashes or whitespace (which browsers can fold into "/"). Otherwise
 * null.
 *
 * This is the frontend mirror of the backend FrontendRedirect::validateReturnTo
 * posture — it exists so a `?callbackUrl=https://evil` (or `//evil`) query
 * param cannot bounce a freshly-authenticated user off-origin (open redirect
 * → credential phishing). Callers fall back to their normal post-login route
 * when this returns null.
 */
export function safeCallbackPath(raw: string | null | undefined): Route | null {
  if (typeof raw !== "string" || raw === "") return null;
  // Single leading slash, second char not "/" or "\", no whitespace/backslash anywhere.
  if (!/^\/(?![/\\])[^\s\\]*$/.test(raw)) return null;
  return raw as Route;
}
