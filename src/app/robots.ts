import type { MetadataRoute } from "next";

import { isIndexableEnvironment } from "@/lib/seo/indexing";

/**
 * robots.txt — generated per deployment.
 *
 * ## Why non-production is NOT `Disallow: /`
 *
 * The instinct is to block crawlers outright on staging and previews. That is
 * exactly wrong here, because this scope adds no `X-Robots-Tag` response
 * header (that needs next.config.ts headers or a widened auth middleware,
 * both out of bounds). The only de-indexing signal is the
 * `<meta name="robots" content="noindex, nofollow">` the root layout emits.
 *
 * A crawler blocked by robots.txt never fetches the page, so it never sees
 * that meta tag. A URL blocked in robots.txt but linked from elsewhere can
 * still be indexed URL-only, and Google explicitly documents that a
 * `Disallow` PREVENTS it from seeing a `noindex`. Blocking would therefore
 * make de-indexing less reliable, not more.
 *
 * So non-production stays crawlable and says "noindex" in the HTML, which is
 * the directive that actually removes a page from the index.
 *
 * ## Prefix matching is the other trap
 *
 * robots.txt matches by PREFIX, not by path segment. Two entries that look
 * obvious are wrong:
 *
 *   /me     also matches /members — would block the whole member directory
 *   /u/me   also matches /u/mega, /u/melissa — would block real handles
 *
 * The first is fixed with a trailing slash. The second has no safe prefix
 * form (`$` anchoring is a non-standard extension; a crawler that ignores it
 * under-blocks), so /u/me is handled by page metadata instead — see
 * app/(main)/(app)/u/me/page.tsx.
 *
 * ## No Sitemap directive
 *
 * A member-profile sitemap is BLOCKED — BACKEND DATA REQUIRED. No frontend
 * endpoint enumerates only public, indexable profiles: /bcc/v1/members maps
 * to a plain WP_User_Query and the contract states the directory may surface
 * hidden and banned users. Advertising a sitemap we cannot build correctly is
 * worse than advertising none.
 */
/**
 * Evaluated per request, not prerendered.
 *
 * By default Next treats this route as static and bakes the answer in at
 * BUILD time — which silently captures the build environment rather than the
 * running one. On Vercel those usually agree, but "usually" is the wrong
 * standard for the control that keeps staging out of Google: promoting one
 * build artifact between environments would ship the wrong robots.txt with
 * nothing to show for it. Verified: with this static, a production-env server
 * still served the non-production body.
 *
 * The cost is one function invocation for a file crawlers fetch rarely.
 */
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexableEnvironment()) {
    // Crawlable on purpose — see the header comment. The root layout's
    // noindex is what keeps these environments out of the index.
    return {
      rules: { userAgent: "*", allow: "/" },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api",
        "/admin",
        "/messages",
        // Trailing slash is load-bearing: bare "/me" also matches "/members".
        "/me/",
        "/settings",
      ],
    },
  };
}
