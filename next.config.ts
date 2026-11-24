import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";
import type { NextConfig } from "next";

import { ROUTE_MOVES } from "./src/lib/route-moves";
import { buildSecurityHeaders } from "./src/lib/security-headers";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The bcc-trust backend lives on a separate WP origin during dev.
  // CORS is handled server-side via BCC_FRONTEND_ORIGIN; we don't
  // proxy through Next's rewrites because the backend's CORS contract
  // is the one we want to exercise in dev (matching prod).
  typedRoutes: true,
  // WP-hosted media (PeepSo avatars, cover photos, feed/comment photos)
  // is served through Vercel's image CDN via next/image. Patterns are
  // path-scoped to /wp-content/** so the optimizer cannot be used as a
  // general proxy of the WP origin. Keep this list in sync with
  // isWpMediaUrl() in src/lib/media.ts — mixed-host call sites use that
  // helper to decide <Image> vs raw <img>. SVG placeholders
  // (avatars-svg/*) never reach next/image: the helper excludes .svg,
  // so dangerouslyAllowSVG stays off.
  images: {
    remotePatterns: [
      // cms.* is the WP origin after the domain cutover; the bare apex is
      // retained because media rows written before the cutover still carry
      // it, and because it stays valid for as long as WP answers on both.
      { protocol: "https", hostname: "cms.bluecollarcrypto.io", pathname: "/wp-content/**" },
      { protocol: "https", hostname: "bluecollarcrypto.io", pathname: "/wp-content/**" },
      { protocol: "https", hostname: "stage.bluecollarcrypto.io", pathname: "/wp-content/**" },
      { protocol: "https", hostname: "blue-collar-crypto-custom.local", pathname: "/wp-content/**" },
      { protocol: "http", hostname: "blue-collar-crypto-custom.local", pathname: "/wp-content/**" },
    ],
  },
  // Security headers on every route (finding S5) — see src/lib/security-headers.ts
  // for why frame-ancestors is enforced while the full CSP is report-only.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders({
          dev: process.env.NODE_ENV !== "production",
          apiUrl: process.env["NEXT_PUBLIC_BCC_API_URL"],
          posthogHost: process.env["NEXT_PUBLIC_POSTHOG_HOST"],
          sentryDsn: process.env["NEXT_PUBLIC_SENTRY_DSN"],
        }),
      },
    ];
  },
  // Permanent (308) route moves: the retired /settings/* space and the
  // Site Structure A moves. The table, its order rules and why each move
  // is permanent live in src/lib/route-moves.ts.
  async redirects() {
    return [...ROUTE_MOVES];
  },
  // Pin the workspace root to this folder so Next does not walk up the
  // tree and pick the stray package-lock.json in the user's home dir.
  outputFileTracingRoot: path.join(__dirname),
  // F-215: the OG image routes read bundled TTFs from src/lib/og/fonts at
  // runtime (lib/og/card-image.tsx). Output tracing does NOT pick those
  // up from readFile(join(process.cwd(), …)) on its own — a build without
  // this listed no font in any opengraph-image route's .nft.json — so on
  // Vercel the files would be missing and every OG image would silently
  // fall back to the built-in font. List them explicitly. Keys are route
  // globs; this matches every opengraph-image route, route groups included.
  outputFileTracingIncludes: {
    "/**/opengraph-image*": ["./src/lib/og/fonts/*.ttf"],
  },
  // @polkadot/* packages use dynamic internal requires to load their
  // WASM bytes. Bundling them breaks those relative-path lookups and
  // causes Vercel lambdas to fail at cold-start. Mark them external so
  // they are loaded from node_modules at runtime, not inlined.
  serverExternalPackages: [
    "@polkadot/util-crypto",
    "@polkadot/wasm-crypto",
    "@polkadot/wasm-crypto-wasm",
    "@polkadot/wasm-bridge",
    "@polkadot/wasm-crypto-asmjs",
    "@polkadot/wasm-crypto-init",
  ],
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "blue-collar-crypto",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env['CI'],

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // tunnelRoute deliberately omitted. Routing every client-side error
  // through a Next.js rewrite at /monitoring would proxy all Sentry
  // traffic through the BCC server (bandwidth cost) for the sole upside
  // of bypassing ad-blockers, which is not a meaningful concern for
  // logged-in BCC users. Re-enable here if telemetry loss to ad-blockers
  // becomes measurable.

  webpack: {
    // Disabled — BCC runs on Local-by-Flywheel + WordPress, not Vercel.
    automaticVercelMonitors: false,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
