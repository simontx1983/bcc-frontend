// This file configures the initialization of Sentry for edge features (middleware, edge routes, and so on).
// The config you add here will be used whenever one of the edge features is loaded.
// Note that this config is unrelated to the Vercel Edge Runtime and is also required when running locally.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

import { scrubSentryEvent } from "@/lib/sentry/scrub";

Sentry.init({
  dsn: process.env['NEXT_PUBLIC_SENTRY_DSN'],

  // See sentry.server.config.ts for rationale.
  environment: process.env['NODE_ENV'],

  // See sentry.server.config.ts for rationale.
  tracePropagationTargets: [
    "localhost",
    /^\//,
    /\/wp-json\/bcc/,
  ],

  // 10% sampling balances signal vs Sentry billing in production. Bump
  // to 1 only when actively debugging.
  tracesSampleRate: 0.1,

  // Disabled: see sentry.server.config.ts for rationale.
  enableLogs: false,

  // Disabled: see sentry.server.config.ts for rationale.
  sendDefaultPii: false,

  // See sentry.server.config.ts: no request cookies or body, ever. Edge
  // also sends no headers: in @sentry/vercel-edge 10 requestData is a
  // default only with sendDefaultPii, so before #322 edge events carried
  // no request data at all. Keep it minimal: the URL (its query is cut by
  // the scrubber) and nothing else.
  integrations: [
    Sentry.requestDataIntegration({
      include: { cookies: false, data: false, query_string: false, headers: false, url: true },
    }),
  ],

  // See sentry.server.config.ts: URLs lose their query string and
  // fragment before any event leaves.
  beforeSend: scrubSentryEvent,
  beforeSendTransaction: scrubSentryEvent,
});
