/**
 * /sitemaps/{members,pages,groups}.xml: one section of the public index
 * (contract §4.33, F-518). All of it, or a 503; never a partial list.
 */

import { SITEMAP_SECTIONS, type SitemapSection } from "@/lib/api/sitemap-endpoints";
import { appOrigin } from "@/lib/app-origin";
import { isIndexableEnvironment } from "@/lib/seo/indexing";
import { readSection } from "@/lib/seo/public-index";
import { notFoundResponse, unavailableResponse, urlsetXml, xmlResponse } from "@/lib/seo/sitemap-xml";

function sectionFromFile(file: string): SitemapSection | null {
  return SITEMAP_SECTIONS.find((s) => `${s}.xml` === file) ?? null;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ section: string }> },
): Promise<Response> {
  const section = sectionFromFile((await params).section);
  if (section === null || !isIndexableEnvironment()) return notFoundResponse();
  const read = await readSection(section);
  if (read.kind === "not_deployed") return notFoundResponse();
  if (read.kind === "unavailable") return unavailableResponse(read.retryAfterSeconds);
  const origin = appOrigin();
  return xmlResponse(urlsetXml(read.value.map((path) => `${origin}${path}`)));
}
