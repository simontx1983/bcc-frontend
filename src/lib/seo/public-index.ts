/**
 * Reads the public index (contract §4.33) for the sitemap routes (F-518).
 *
 * All or nothing per section. A section is either every path the server
 * listed or a failure: a 503, a rate limit, a network error, or a guard
 * tripping on ANY page fails the whole section, so a sitemap never ships
 * a partial list. The routes turn that into a 503, and a crawler keeps its
 * last good copy, which is the contract's rule for the client.
 *
 * A route the server doesn't have (`rest_no_route`, a backend without
 * F-518) is "not deployed": the routes answer 404, which is what the app
 * did before it had a sitemap.
 *
 * Cost: a full section is many upstream pages, so a good result is cached
 * for SITEMAP_CACHE_SECONDS in Next's Data Cache, shared across requests.
 * A failure throws inside the cache and so is never cached.
 */

import * as Sentry from "@sentry/nextjs";
import { unstable_cache } from "next/cache";

import { retryAfterSeconds } from "@/lib/api/errors";
import { getSitemapPage, type SitemapSection } from "@/lib/api/sitemap-endpoints";
import { BccApiError } from "@/lib/api/types";

/** How long a good section (and the index probe) is reused. */
export const SITEMAP_CACHE_SECONDS = 300;

/** Most upstream pages one section may take; past it, fail rather than truncate. */
export const MAX_SCAN_PAGES = 200;

/** sitemaps.org: one sitemap file holds at most 50,000 URLs. */
export const MAX_URLS_PER_SITEMAP = 50_000;

export type IndexRead<T> =
  | { kind: "ok"; value: T }
  | { kind: "not_deployed" }
  | { kind: "unavailable"; retryAfterSeconds: number | null };

class NotDeployed extends Error {
  override readonly name = "NotDeployed";
}

class Unavailable extends Error {
  override readonly name = "Unavailable";
  readonly retryAfterSeconds: number | null;
  constructor(message: string, retryAfter: number | null = null) {
    super(message);
    this.retryAfterSeconds = retryAfter;
  }
}

function classify(err: unknown): Error {
  if (err instanceof BccApiError && err.code === "rest_no_route") {
    return new NotDeployed("sitemap route not on this server");
  }
  return new Unavailable("sitemap read failed", retryAfterSeconds(err));
}

/** A path the app serves: one leading slash, nothing that could leave the origin. */
function isAppPath(path: unknown): path is string {
  return typeof path === "string" && path.startsWith("/") && !path.startsWith("//") && !/[\s\\]/.test(path);
}

function report(message: string, extra: Record<string, unknown>): void {
  Sentry.captureMessage(`[sitemap] ${message}`, { level: "warning", extra });
}

async function scanSection(section: SitemapSection): Promise<string[]> {
  const paths: string[] = [];
  let after = 0;
  for (let page = 0; page < MAX_SCAN_PAGES; page++) {
    let res;
    try {
      res = await getSitemapPage(section, after);
    } catch (err) {
      throw classify(err);
    }
    for (const item of res.items) {
      if (isAppPath(item.path)) {
        paths.push(item.path);
      } else {
        report("skipped a path that is not an app path", { section, after });
      }
    }
    if (paths.length > MAX_URLS_PER_SITEMAP) {
      report("section is over one sitemap's URL limit", { section, count: paths.length });
      throw new Unavailable("section over the URL limit");
    }
    if (res.next_after === null) return paths;
    if (!Number.isInteger(res.next_after) || res.next_after <= after) {
      report("next_after did not advance", { section, after, next_after: res.next_after });
      throw new Unavailable("next_after did not advance");
    }
    after = res.next_after;
  }
  report("section scan hit the page guard", { section, pages: MAX_SCAN_PAGES });
  throw new Unavailable("section scan hit the page guard");
}

async function probe(): Promise<true> {
  try {
    await getSitemapPage("members", 0, 1);
    return true;
  } catch (err) {
    throw classify(err);
  }
}

// The section name is an argument, so it is part of the cache key.
const cachedSection = unstable_cache(scanSection, ["bcc-sitemap-section-v1"], {
  revalidate: SITEMAP_CACHE_SECONDS,
});

const cachedProbe = unstable_cache(probe, ["bcc-sitemap-probe-v1"], {
  revalidate: SITEMAP_CACHE_SECONDS,
});

async function settle<T>(read: () => Promise<T>): Promise<IndexRead<T>> {
  try {
    return { kind: "ok", value: await read() };
  } catch (err) {
    if (err instanceof NotDeployed) return { kind: "not_deployed" };
    if (err instanceof Unavailable) return { kind: "unavailable", retryAfterSeconds: err.retryAfterSeconds };
    return { kind: "unavailable", retryAfterSeconds: null };
  }
}

/** Every path in one section, or why there is none to give. */
export function readSection(section: SitemapSection): Promise<IndexRead<string[]>> {
  return settle(() => cachedSection(section));
}

/** Whether this backend serves the public index at all (one cheap page). */
export function probeIndex(): Promise<IndexRead<true>> {
  return settle(() => cachedProbe());
}
