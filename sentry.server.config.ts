// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env['NEXT_PUBLIC_SENTRY_DSN'],

  // Tag every event with the runtime environment so dev/prod/test can
  // be filtered separately. next build/start sets NODE_ENV=production,
  // next dev sets development, vitest/jest set test.
  environment: process.env['NODE_ENV'],

  // Stitch traces across the Next.js → bcc-trust WP boundary. Outbound
  // requests matching these patterns get sentry-trace + baggage headers
  // attached, so an error on the WP side correlates back to the Next.js
  // request that triggered it. Localhost stays in to keep `next dev`
  // traces working; same-origin (^\/) covers Next API routes; the
  // wp-json/bcc segment matches any deployment of the BCC REST surface.
  tracePropagationTargets: [
    "localhost",
    /^\//,
    /\/wp-json\/bcc/,
  ],

  // 10% sampling balances signal vs Sentry billing in production. Bump
  // to 1 only when actively debugging.
  tracesSampleRate: 0.1,

  // Disabled: console.* forwarding combined with PII would leak user
  // data via incidental log statements. Re-enable only with an explicit
  // beforeSend redaction layer.
  enableLogs: false,

  // Disabled: BCC handles wallet addresses, NFT holdings, dispute
  // metadata, and PeepSo private-group membership. Sending IPs, headers,
  // cookies, and request bodies to Sentry by default is incompatible
  // with that surface. Selectively opt back in if a specific field is
  // genuinely needed.
  sendDefaultPii: false,
});
