// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { sentryPrivacyOptions } from "@/lib/sentry/scrub";

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

  ...sentryPrivacyOptions,
  dataCollection: {
    ...sentryPrivacyOptions.dataCollection,
    httpHeaders: {
      request: { allow: ["user-agent", "referer"] },
      response: false,
    },
  },

  // Keep the request path and diagnostic headers. The scrubber strips
  // queries from URLs, including the Referer.
  integrations: [
    Sentry.requestDataIntegration({
      include: { cookies: false, data: false, query_string: false, ip: false, headers: true, url: true },
    }),
  ],
});
