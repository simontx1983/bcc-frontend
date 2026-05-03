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

export default nextConfig;
