// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env['NEXT_PUBLIC_SENTRY_DSN'],

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
