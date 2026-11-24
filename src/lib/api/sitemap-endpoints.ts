/**
 * The public index behind the app's sitemap (contract §4.33, v1.228,
 * F-518): what a signed-out visitor may open, as app paths, keyset-paged.
 *
 * Anonymous and viewer-independent: a token never widens the answer, so
 * none is ever sent.
 */

import { bccFetch } from "@/lib/api/client";

export const SITEMAP_SECTIONS = ["members", "pages", "groups"] as const;

export type SitemapSection = (typeof SITEMAP_SECTIONS)[number];

export interface SitemapPage {
  /** Canonical app paths (`/u/alice`), ascending by id. The client adds its origin. */
  items: Array<{ path: string }>;
  /**
   * The last id SCANNED. Eligibility is checked after the scan, so a page
   * can hold fewer items than asked for, even none, and still have a next
   * page. Null only when the scan reached the end.
   */
  next_after: number | null;
}

/** The contract's maximum page size. */
export const SITEMAP_PAGE_LIMIT = 1000;

/** GET /bcc/v1/sitemap/{section}?after=&limit= */
export function getSitemapPage(
  section: SitemapSection,
  after: number,
  limit: number = SITEMAP_PAGE_LIMIT,
): Promise<SitemapPage> {
  return bccFetch<SitemapPage>(`sitemap/${section}?after=${after}&limit=${limit}`, { token: null });
}
