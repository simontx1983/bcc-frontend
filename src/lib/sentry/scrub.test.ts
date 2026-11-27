/**
 * Sentry events lose every URL's query string and fragment (free agent
 * security finding, 2026-11-18): `?pt=` on /signup/complete-profile and
 * `?key=&login=` on the password-reset link were recorded as sent.
 *
 * Two halves:
 *   - scrubSentryEvent itself, on realistic error and transaction events;
 *   - the wiring: each real config (browser, server, edge) hands Sentry
 *     hooks that, when RUN, return a scrubbed event. Calling the captured
 *     hook (not just comparing references) means a gutted scrubber fails
 *     here too.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SCRUB_CIRCULAR, SCRUB_TRUNCATED, scrubSentryEvent } from "@/lib/sentry/scrub";

const PT = "pt-secret-7f3a";
const KEY = "reset-key-91bc";

function errorEvent() {
  return {
    event_id: "e1",
    message: "Failed to load https://app.example/signup/complete-profile?pt=" + PT,
    transaction: "/reset-password?key=" + KEY + "&login=alice",
    request: {
      url: "https://app.example/signup/complete-profile?pt=" + PT + "#done",
      query_string: "pt=" + PT,
      headers: {
        Referer: "https://app.example/reset-password?key=" + KEY + "&login=alice",
        "User-Agent": "Mozilla/5.0",
      },
    },
    breadcrumbs: [
      {
        category: "navigation",
        data: { from: "/reset-password?key=" + KEY + "&login=alice", to: "/login" },
      },
      { category: "fetch", data: { url: "/api/auth/callback/google?code=abc&state=xyz", method: "GET" } },
    ],
    exception: {
      values: [
        {
          type: "Error",
          value: "bad link (/signup/complete-profile?pt=" + PT + ")",
          stacktrace: { frames: [{ filename: "app:///_next/static/chunks/a.js?dpl=1", lineno: 1 }] },
        },
      ],
    },
    tags: { note: "Why? Because." },
  };
}

function transactionEvent() {
  return {
    type: "transaction",
    transaction: "/signup/complete-profile?pt=" + PT,
    contexts: {
      trace: {
        data: {
          url: "https://app.example/signup/complete-profile?pt=" + PT,
          "http.query": "?pt=" + PT,
          "http.fragment": "#x",
        },
      },
    },
    spans: [
      {
        op: "http.client",
        description: "GET /wp-json/bcc/v1/auth/reset?key=" + KEY + "&login=alice",
        data: {
          "url.full": "https://wp.example/wp-json/bcc/v1/auth/reset?key=" + KEY,
          "url.query": "key=" + KEY,
          "url.fragment": "",
          "http.method": "GET",
        },
      },
    ],
  };
}

const leaks = (e: unknown) => {
  const s = JSON.stringify(e);
  return [PT, KEY, "login=alice", "code=abc", "state=xyz", "dpl=1"].filter((x) => s.includes(x));
};

describe("scrubSentryEvent", () => {
  it("an error event keeps paths but no query string or fragment anywhere", () => {
    const out = scrubSentryEvent(errorEvent());
    expect(leaks(out)).toEqual([]);
    expect(out.request.url).toBe("https://app.example/signup/complete-profile");
    expect(out.request.headers.Referer).toBe("https://app.example/reset-password");
    expect(out.request).not.toHaveProperty("query_string");
    expect(out.transaction).toBe("/reset-password");
    expect(out.breadcrumbs[0]?.data.from).toBe("/reset-password");
    expect(out.breadcrumbs[1]?.data.url).toBe("/api/auth/callback/google");
    expect(out.exception.values[0]?.value).toBe("bad link (/signup/complete-profile)");
  });

  it("a transaction keeps span paths and drops query-only attributes", () => {
    const out = scrubSentryEvent(transactionEvent());
    expect(leaks(out)).toEqual([]);
    expect(out.transaction).toBe("/signup/complete-profile");
    expect(out.spans[0]?.description).toBe("GET /wp-json/bcc/v1/auth/reset");
    expect(out.spans[0]?.data["url.full"]).toBe("https://wp.example/wp-json/bcc/v1/auth/reset");
    expect(out.spans[0]?.data).not.toHaveProperty("url.query");
    expect(out.contexts.trace.data).not.toHaveProperty("http.query");
    expect(out.spans[0]?.data["http.method"]).toBe("GET");
  });

  it("leaves non-URL text and non-string values alone, and does not mutate its input", () => {
    const input = errorEvent();
    const out = scrubSentryEvent(input);
    expect(out.tags.note).toBe("Why? Because.");
    expect(out.request.headers["User-Agent"]).toBe("Mozilla/5.0");
    expect(out.exception.values[0]?.stacktrace.frames[0]?.lineno).toBe(1);
    expect(input.request.url).toContain(PT);
  });
});

describe("request credentials and body (#322 review)", () => {
  it("drops cookies, the body and credential headers in any case; keeps the rest", () => {
    const out = scrubSentryEvent({
      request: {
        url: "https://app.example/settings",
        cookies: { "__Secure-next-auth.session-token": "SESSION" },
        data: { password: "hunter2" },
        headers: {
          Cookie: "__Secure-next-auth.session-token=SESSION",
          authorization: "Bearer BEARER",
          "Proxy-Authorization": "Basic PROXY",
          "User-Agent": "Mozilla/5.0",
        },
      },
    });
    const s = JSON.stringify(out);
    for (const leak of ["SESSION", "BEARER", "PROXY", "hunter2"]) expect(s).not.toContain(leak);
    expect(out.request).not.toHaveProperty("cookies");
    expect(out.request).not.toHaveProperty("data");
    expect(out.request.headers).toEqual({ "User-Agent": "Mozilla/5.0" });
  });
});

describe("bounded walk (#322 review)", () => {
  it("fails closed past the depth limit: the deep subtree is replaced, not passed on", () => {
    let deep: Record<string, unknown> = { url: "/reset-password?key=" + KEY };
    for (let i = 0; i < 40; i++) deep = { next: deep };
    const out = scrubSentryEvent({ extra: deep });
    const s = JSON.stringify(out);
    expect(s).not.toContain(KEY);
    expect(s).toContain(SCRUB_TRUNCATED);
  });

  it("a plain-object cycle becomes a marker instead of hanging", () => {
    const loop: Record<string, unknown> = { url: "/x?key=" + KEY };
    loop["self"] = loop;
    const out = scrubSentryEvent({ extra: loop }) as { extra: Record<string, unknown> };
    expect(out.extra["self"]).toBe(SCRUB_CIRCULAR);
    expect(out.extra["url"]).toBe("/x");
  });

  it("class instances (even cyclic) are passed through by reference, never walked", () => {
    class Holder {
      self: Holder;
      big: number[] = Array.from({ length: 1000 }, (_, i) => i);
      constructor() {
        this.self = this;
      }
    }
    const scope = new Holder();
    const other = new Holder();
    const t0 = performance.now();
    const out = scrubSentryEvent({
      sdkProcessingMetadata: {
        capturedSpanScope: scope,
        dynamicSamplingContext: { transaction: "GET /signup/complete-profile?pt=" + PT },
      },
      extra: { holder: other },
    });
    expect(performance.now() - t0).toBeLessThan(50);
    expect(out.sdkProcessingMetadata.capturedSpanScope).toBe(scope);
    expect(out.sdkProcessingMetadata.dynamicSamplingContext.transaction).toBe("GET /signup/complete-profile");
    expect(out.extra.holder).toBe(other);
  });
});

// ── Wiring: every real config runs the scrubber ─────────────────────────
const init = vi.hoisted(() => vi.fn());
const requestDataIntegration = vi.hoisted(() =>
  vi.fn((options: unknown) => ({ name: "RequestData", options })),
);
vi.mock("@sentry/nextjs", () => ({
  init,
  requestDataIntegration,
  captureRouterTransitionStart: vi.fn(),
  captureRequestError: vi.fn(),
}));
vi.mock("@/lib/analytics/posthog", () => ({ initAnalytics: vi.fn() }));

type Hooks = {
  beforeSend: (e: unknown, h: unknown) => unknown;
  beforeSendTransaction: (e: unknown, h: unknown) => unknown;
  beforeSendLog: () => null;
  traceLifecycle: string;
  dataCollection: { httpHeaders: unknown };
  integrations?: Array<{ name: string; options: unknown }>;
};

describe("each Sentry config runs the scrubber", () => {
  beforeEach(() => {
    vi.resetModules();
    init.mockReset();
  });
  afterEach(() => vi.resetModules());

  it.each([
    ["browser", () => import("@/instrumentation-client")],
    ["server", () => import("../../../sentry.server.config")],
    ["edge", () => import("../../../sentry.edge.config")],
  ])("%s: beforeSend and beforeSendTransaction strip pt and key", async (_name, load) => {
    await load();
    expect(init).toHaveBeenCalledTimes(1);
    const opts = init.mock.calls[0]?.[0] as Hooks;
    expect(opts).toMatchObject({
      traceLifecycle: "static",
      attachStacktrace: false,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpBodies: [],
        urlQueryParams: false,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        mcp: { inputs: false, outputs: false },
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
      },
    });
    expect(opts.beforeSendLog()).toBeNull();
    expect(leaks(opts.beforeSend(errorEvent(), {}))).toEqual([]);
    expect(leaks(opts.beforeSendTransaction(transactionEvent(), {}))).toEqual([]);
  });

  it.each([
    ["server", () => import("../../../sentry.server.config")],
    ["edge", () => import("../../../sentry.edge.config")],
  ])("%s: never collects request cookies or the body", async (_name, load) => {
    await load();
    const opts = init.mock.calls[0]?.[0] as Hooks;
    const rd = opts.integrations?.find((i) => i.name === "RequestData");
    expect(rd?.options).toMatchObject({
      include: { cookies: false, data: false, query_string: false, ip: false },
    });
  });

  it.each([
    ["browser", () => import("@/instrumentation-client")],
    ["edge", () => import("../../../sentry.edge.config")],
  ])("%s disables header collection", async (_name, load) => {
    await load();
    const opts = init.mock.calls[0]?.[0] as Hooks;
    expect(opts.dataCollection.httpHeaders).toBe(false);
  });

  it("keeps only the request path on Edge", async () => {
    await import("../../../sentry.edge.config");
    const opts = init.mock.calls[0]?.[0] as Hooks;
    const rd = opts.integrations?.find((i) => i.name === "RequestData");
    expect(rd?.options).toMatchObject({ include: { headers: false, url: true } });
  });

  it("keeps the existing diagnostic header values on the server", async () => {
    await import("../../../sentry.server.config");
    const opts = init.mock.calls[0]?.[0] as Hooks;
    expect(opts.dataCollection.httpHeaders).toEqual({
      request: { allow: ["user-agent", "referer"] },
      response: false,
    });
  });
});
