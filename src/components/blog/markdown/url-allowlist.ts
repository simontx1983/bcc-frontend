import { defaultUrlTransform } from "react-markdown";

/**
 * Explicit URL-scheme allowlist for the blog markdown renderer (audit F4).
 *
 * The XSS-safe handling of link/image URLs must be INTENTIONAL, not an implicit
 * reliance on react-markdown's default `urlTransform`: a future change (e.g.
 * allowing `ipfs:`) would otherwise silently reintroduce a `javascript:` /
 * `data:` sink. To add a scheme, extend this set deliberately — and weigh the
 * XSS implications when you do. Kept in its own module so the security rule is
 * unit-tested in isolation (see url-allowlist.test.ts).
 */
export const ALLOWED_URL_SCHEMES = new Set(["http", "https", "mailto"]);

/**
 * Belt-and-suspenders URL sanitiser for `<ReactMarkdown urlTransform>`.
 * Composes react-markdown's own sanitiser (defence in depth) with the positive
 * scheme allowlist above so the protection is regression-proof and visible:
 *   - relative / fragment / query URLs (no scheme) → internal links + anchors, kept
 *   - http / https / mailto → kept
 *   - everything else (javascript:, data:, vbscript:, …) → dropped (empty string)
 */
export function safeUrlTransform(url: string): string {
  const sanitized = defaultUrlTransform(url);
  if (sanitized === "") return "";
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(sanitized.trim());
  // No scheme → relative path / fragment / query; safe to keep.
  if (scheme === null || scheme[1] === undefined) return sanitized;
  return ALLOWED_URL_SCHEMES.has(scheme[1].toLowerCase()) ? sanitized : "";
}

/**
 * A fixed, never-resolvable base for deciding "is this on our own site".
 * Fixed rather than `location` so the answer is the same in SSR.
 */
const INTERNAL_BASE = "https://bcc.internal.invalid";
const INTERNAL_ORIGIN = new URL(INTERNAL_BASE).origin;

/**
 * The same-site path a URL points to, or null if it leaves the site.
 *
 * A regex on the raw string is not enough: browsers strip TAB, LF and CR
 * anywhere in a URL and treat `\` like `/`, so `/\t/evil.com`,
 * `/\n/evil.com` and `/\evil.com` all become `//evil.com` and leave the
 * site, even though they start with a single `/`. So the browser's own
 * parser decides: resolve against a fixed base and keep it only if the
 * origin did not change. Callers render the RESOLVED path, never the raw
 * string, so what is checked is what is navigated to.
 */
export function internalPathOf(url: string): string | null {
  if (!url.startsWith("/")) return null;
  const path = resolveSameOrigin(url);
  if (path === null) return null;
  // Dot segments can collapse into a protocol-relative path that is
  // same-origin against the base but leaves the site once rendered:
  // `/..//evil.com` resolves to the PATH "//evil.com". Refuse any such
  // path, and require the rendered value to be stable: resolving it
  // again must give the same path.
  if (/^\/[/\\]/.test(path)) return null;
  if (resolveSameOrigin(path) !== path) return null;
  return path;
}

function resolveSameOrigin(url: string): string | null {
  let resolved: URL;
  try {
    resolved = new URL(url, INTERNAL_BASE);
  } catch {
    return null;
  }
  if (resolved.origin !== INTERNAL_ORIGIN) return null;
  return resolved.pathname + resolved.search + resolved.hash;
}

/** True when {@link internalPathOf} finds a same-site path. */
export function isInternalPath(url: string): boolean {
  return internalPathOf(url) !== null;
}
