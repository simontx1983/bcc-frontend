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
  // Pin the workspace root to this folder so Next does not walk up the
  // tree and pick the stray package-lock.json in the user's home dir.
  outputFileTracingRoot: path.join(__dirname),
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
