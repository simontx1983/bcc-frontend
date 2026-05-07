// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env['NEXT_PUBLIC_SENTRY_DSN'],

  // See sentry.server.config.ts for rationale.
  environment: process.env['NODE_ENV'],

  // Stitch traces from browser fetches into the Next.js + bcc-trust
  // call chain. Without this, browser-initiated requests are tagged in
  // Sentry as orphaned spans rather than children of the user action.
  tracePropagationTargets: [
    "localhost",
    /^\//,
    /\/wp-json\/bcc/,
  ],

  // Replay deliberately omitted. It records full DOM state, which on
  // BCC pages would capture wallet addresses, token balances, NFT
  // inventory, holder-group membership, and dispute content. Re-enable
  // only after a redaction policy is in place (maskAllText: true,
  // blockAllMedia: true at minimum) and a documented use case.

  // 10% sampling balances signal vs Sentry billing in production. Bump
  // to 1 only when actively debugging.
  tracesSampleRate: 0.1,

  // Disabled: see sentry.server.config.ts for rationale.
  enableLogs: false,

  // Disabled: see sentry.server.config.ts for rationale.
  sendDefaultPii: false,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
