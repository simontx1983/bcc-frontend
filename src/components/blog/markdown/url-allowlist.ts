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
