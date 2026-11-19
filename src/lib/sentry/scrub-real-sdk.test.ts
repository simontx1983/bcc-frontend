// @vitest-environment node
/**
 * #322 review (free agent, HIGH): a REAL Sentry 10 transaction reaches
 * beforeSendTransaction with `sdkProcessingMetadata.capturedSpanScope` /
 * `capturedSpanIsolationScope`, live Scope instances that reach the whole
 * client. The first scrubber walked them (~18.8M nodes, ~5.8 s
 * synchronously, on ~1 in 10 requests). This drives the actual SDK with a
 * stub transport (nothing is sent) and checks the scrubber is fast, leaves
 * those instances untouched, and still strips the URL.
 */

import * as Sentry from "@sentry/node";
import { afterAll, describe, expect, it } from "vitest";

import { scrubSentryEvent } from "@/lib/sentry/scrub";

type Captured = { event: Record<string, unknown>; out: Record<string, unknown>; ms: number };

const transactions: Captured[] = [];
const errors: Captured[] = [];

function timed(event: Record<string, unknown>, into: Captured[]): null {
  const t0 = performance.now();
  const out = scrubSentryEvent(event);
  into.push({ event, out, ms: performance.now() - t0 });
  return null; // never send
}

Sentry.init({
  dsn: "https://public@o0.ingest.sentry.io/0",
  tracesSampleRate: 1,
  sendDefaultPii: false,
  transport: () => ({ send: async () => ({}), flush: async () => true }),
  beforeSendTransaction: (event) => timed(event as unknown as Record<string, unknown>, transactions),
  beforeSend: (event) => timed(event as unknown as Record<string, unknown>, errors),
});

afterAll(async () => {
  await Sentry.close(1000);
});

describe("scrubSentryEvent on real SDK events", () => {
  it("a transaction: fast, Scopes untouched, URL stripped", async () => {
    Sentry.startSpan({ name: "GET /signup/complete-profile?pt=SECRET", op: "http.server" }, () => undefined);
    await Sentry.flush(2000);
    const got = transactions.at(-1);
    expect(got).toBeDefined();
    if (got === undefined) return;
    const meta = got.event["sdkProcessingMetadata"] as Record<string, unknown> | undefined;
    expect(meta?.["capturedSpanScope"]).toBeDefined();
    const outMeta = got.out["sdkProcessingMetadata"] as Record<string, unknown> | undefined;
    expect(outMeta?.["capturedSpanScope"]).toBe(meta?.["capturedSpanScope"]);
    expect(outMeta?.["capturedSpanIsolationScope"]).toBe(meta?.["capturedSpanIsolationScope"]);
    expect(got.out["transaction"]).toBe("GET /signup/complete-profile");
    expect(got.ms).toBeLessThan(100);
  });

  it("an error event: request cookies, auth headers and body are dropped", async () => {
    // Built at run time: the SDK's ContextLines integration embeds this
    // file's SOURCE lines in the event, so a literal secret here would be
    // "found" in the stack frames and say nothing about the scrubber.
    const rand = () => Math.random().toString(36).slice(2, 10);
    const [session, bearer, password, resetKey, login] = [rand(), rand(), rand(), rand(), rand()];
    Sentry.withScope((scope) => {
      scope.setSDKProcessingMetadata({
        normalizedRequest: {
          url: `https://app.example/reset-password?key=${resetKey}&login=${login}`,
          method: "POST",
          headers: {
            cookie: `__Secure-next-auth.session-token=${session}`,
            Authorization: `Bearer ${bearer}`,
            "user-agent": "Mozilla/5.0",
          },
          cookies: { "__Secure-next-auth.session-token": session },
          data: JSON.stringify({ password }),
          query_string: `key=${resetKey}&login=${login}`,
        },
      });
      Sentry.captureException(new Error("boom"));
    });
    await Sentry.flush(2000);
    const got = errors.at(-1);
    expect(got).toBeDefined();
    if (got === undefined) return;
    const { sdkProcessingMetadata: _internal, ...sent } = got.out;
    const s = JSON.stringify(sent);
    for (const leak of [session, bearer, password, resetKey, login]) {
      expect(s).not.toContain(leak);
    }
    expect(got.ms).toBeLessThan(100);
  });
});
