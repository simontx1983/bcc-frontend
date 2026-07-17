import { withSentryConfig } from "@sentry/nextjs";
import path from "node:path";
import type { NextConfig } from "next";

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
      { protocol: "https", hostname: "bluecollarcrypto.io", pathname: "/wp-content/**" },
      { protocol: "https", hostname: "stage.bluecollarcrypto.io", pathname: "/wp-content/**" },
      { protocol: "https", hostname: "blue-collar-crypto-custom.local", pathname: "/wp-content/**" },
      { protocol: "http", hostname: "blue-collar-crypto-custom.local", pathname: "/wp-content/**" },
    ],
  },
  // Pin the workspace root to this folder so Next does not walk up the
  // tree and pick the stray package-lock.json in the user's home dir.
  outputFileTracingRoot: path.join(__dirname),
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
