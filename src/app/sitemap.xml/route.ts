/**
 * /sitemap.xml: the sitemap index (F-518). It lists one sitemap per
 * section of the public index (contract §4.33), so a section that is
 * briefly unavailable fails only its own file and is never dropped from
 * the index.
 *
 * Only the indexable deployment has one (the same gate as robots.txt and
 * the noindex meta). A backend without the routes answers 404, which is
 * what this path did before the app had a sitemap.
 */

import { SITEMAP_SECTIONS } from "@/lib/api/sitemap-endpoints";
import { appOrigin } from "@/lib/app-origin";
import { isIndexableEnvironment } from "@/lib/seo/indexing";
import { probeIndex } from "@/lib/seo/public-index";
import { notFoundResponse, sitemapIndexXml, unavailableResponse, xmlResponse } from "@/lib/seo/sitemap-xml";

/**
 * Evaluated per request. A GET handler that reads no request data is
 * otherwise prerendered at BUILD time, baking in the build environment's
 * answer (a 404, since a build is not the indexable deployment): the same
 * trap robots.ts documents. The upstream cost stays bounded by the Data
 * Cache in lib/seo/public-index.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  if (!isIndexableEnvironment()) return notFoundResponse();
  const probe = await probeIndex();
  if (probe.kind === "not_deployed") return notFoundResponse();
  if (probe.kind === "unavailable") return unavailableResponse(probe.retryAfterSeconds);
  const origin = appOrigin();
  return xmlResponse(sitemapIndexXml(SITEMAP_SECTIONS.map((s) => `${origin}/sitemaps/${s}.xml`)));
}
