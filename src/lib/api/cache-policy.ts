/**
 * Cache-policy constants for SSR reads (F2 — anon edge/Data-Cache seam).
 *
 * These windows are passed to the `revalidate` option on the server-safe
 * endpoint wrappers (getUser / getCardEntity / getGroup), which forward it
 * to Next's fetch Data Cache. They apply ONLY to anonymous reads
 * (token === null): an authed/personalized fetch must stay uncached so a
 * viewer-specific response is never served to anyone else. See
 * `lib/api/client.ts` (`revalidate` on RequestOptions) for the mechanism.
 *
 * Why these numbers:
 *   - ANON_SSR_REVALIDATE_SECONDS mirrors the backend's existing ~30s
 *     per-viewer view-model cache; 60s here keeps the Vercel→WP round-trip
 *     off the hot path for popular public profiles/entities without making
 *     anything feel stale.
 * The OG image routes use a longer window (1h) declared inline as a literal
 * `export const revalidate` — route-segment config must be a static literal,
 * so it can't import this const. The social card is cosmetic and expensive
 * to render (satori), so 1h absorbs crawler re-fetch + re-share storms while
 * a slowly-drifting reputation number on a share card is harmless.
 */

/** Anonymous SSR view-model fetches (public profile / entity pages, metadata). */
export const ANON_SSR_REVALIDATE_SECONDS = 60;
