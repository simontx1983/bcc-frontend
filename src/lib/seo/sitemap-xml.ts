/**
 * XML bodies and responses for the sitemap routes (F-518).
 *
 * A 200 is cacheable at the CDN. A 503 is never cached (contract §4.33: a
 * client keeps its last good copy) and carries Retry-After.
 */

import { SITEMAP_CACHE_SECONDS } from "@/lib/seo/public-index";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const HEAD = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NS = "http://www.sitemaps.org/schemas/sitemap/0.9";

function wrap(root: string, entries: readonly string[]): string {
  const body = entries.length === 0 ? "" : `${entries.join("\n")}\n`;
  return `${HEAD}<${root} xmlns="${NS}">\n${body}</${root}>\n`;
}

export function urlsetXml(urls: readonly string[]): string {
  return wrap("urlset", urls.map((u) => `<url><loc>${escapeXml(u)}</loc></url>`));
}

export function sitemapIndexXml(urls: readonly string[]): string {
  return wrap("sitemapindex", urls.map((u) => `<sitemap><loc>${escapeXml(u)}</loc></sitemap>`));
}

/** CDN window for a good sitemap. The Data Cache under it refreshes every SITEMAP_CACHE_SECONDS. */
const CDN_SECONDS = 3600;

export function xmlResponse(xml: string): Response {
  return new Response(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": `public, s-maxage=${CDN_SECONDS}`,
    },
  });
}

export function unavailableResponse(retryAfterSeconds: number | null): Response {
  const wait =
    retryAfterSeconds !== null && retryAfterSeconds > 0 ? Math.ceil(retryAfterSeconds) : SITEMAP_CACHE_SECONDS;
  return new Response("Sitemap temporarily unavailable.", {
    status: 503,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "Retry-After": String(wait),
    },
  });
}

export function notFoundResponse(): Response {
  return new Response("Not found.", {
    status: 404,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
