/**
 * media.ts — decides which remote images may go through next/image.
 *
 * WP-hosted media (PeepSo avatars, cover photos, feed/comment photos)
 * is served through Vercel's image CDN; everything else — Giphy,
 * Gravatar, arbitrary NFT-marketplace/IPFS hosts, blob: previews —
 * keeps a raw <img>, because next/image requires an allow-listed host
 * and those are either already CDNs or not enumerable.
 *
 * Keep the host/path rules here in sync with images.remotePatterns in
 * next.config.ts — a URL this helper approves that the config doesn't
 * allow would 400 at /_next/image.
 */

import { clientEnv } from "@/lib/env";

const WP_MEDIA_HOSTS: ReadonlySet<string> = new Set(
  [
    "bluecollarcrypto.io",
    "stage.bluecollarcrypto.io",
    // Local-by-Flywheel dev origin; also covered dynamically via
    // BCC_API_URL below, listed here so a prod build pointed at a
    // different API host still recognizes local fixtures.
    "blue-collar-crypto-custom.local",
    apiHost(),
  ].filter((h): h is string => h !== null)
);

function apiHost(): string | null {
  try {
    return new URL(clientEnv.BCC_API_URL).hostname;
  } catch {
    return null;
  }
}

/**
 * True when `url` is WP-origin media that next/image may optimize:
 * an allow-listed host, under /wp-content/, and not an SVG (PeepSo
 * placeholder avatars are SVGs; next/image blocks SVG by default and
 * we deliberately keep dangerouslyAllowSVG off — SVG sources stay on
 * the existing <img>/initials fallback paths).
 */
export function isWpMediaUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    // Relative, blob:, data: — not eligible.
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }
  if (!WP_MEDIA_HOSTS.has(parsed.hostname)) {
    return false;
  }
  if (!parsed.pathname.startsWith("/wp-content/")) {
    return false;
  }
  if (parsed.pathname.toLowerCase().endsWith(".svg")) {
    return false;
  }
  return true;
}
