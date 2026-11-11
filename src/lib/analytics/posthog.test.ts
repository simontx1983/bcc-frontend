
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as AnalyticsModule from "@/lib/analytics/posthog";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
  identify: vi.fn(),
  register_once: vi.fn(),
  reset: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: sdk }));

type Wrapper = typeof AnalyticsModule;

/** Fresh module per test: it reads env and holds init state at load. */
async function load(configured = true): Promise<Wrapper> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", configured ? "phc_test" : "");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", configured ? "https://ph.example" : "");
  return import("@/lib/analytics/posthog");
}


beforeEach(() => {
  window.localStorage.clear();
  for (const fn of Object.values(sdk)) fn.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("analytics consent", () => {
  it("does not start the SDK or capture anything before opt-in", async () => {
    const a = await load();
    a.initAnalytics();
    a.captureAnalyticsEvent("message_sent");
    a.captureAnalyticsPageview("/feed");
    a.captureAnalyticsException(new Error("x"));
    await a.setAnalyticsViewer("17");

    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(sdk.captureException).not.toHaveBeenCalled();
    expect(sdk.identify).not.toHaveBeenCalled();
  });

  it("does not capture after a decline", async () => {
    const a = await load();
    a.setAnalyticsConsent("denied");
    a.captureAnalyticsEvent("message_sent");

    expect(window.localStorage.getItem(a.CONSENT_STORAGE_KEY)).toBe("denied");
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it("starts and captures after opt-in", async () => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    a.captureAnalyticsEvent("wallet_linked", { chain_slug: "cosmoshub" });

    expect(window.localStorage.getItem(a.CONSENT_STORAGE_KEY)).toBe("granted");
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.opt_in_capturing).toHaveBeenCalled();
    expect(sdk.capture).toHaveBeenCalledWith("wallet_linked", { chain_slug: "cosmoshub" });
  });

  it("starts at load when consent was stored earlier", async () => {
    window.localStorage.setItem("bcc-analytics-consent", "granted");
    const a = await load();
    a.initAnalytics();
    expect(sdk.init).toHaveBeenCalledTimes(1);
  });

  it("stops capturing when consent is withdrawn", async () => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    a.setAnalyticsConsent("denied");
    a.captureAnalyticsEvent("message_sent");

    expect(sdk.reset).toHaveBeenCalled();
    expect(sdk.opt_out_capturing).toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it("is inert when PostHog is not configured", async () => {
    const a = await load(false);
    expect(a.isAnalyticsConfigured).toBe(false);
    a.setAnalyticsConsent("granted");
    a.captureAnalyticsEvent("message_sent");
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it("skips page views on denied routes", async () => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    a.captureAnalyticsPageview("/login/two-factor");
    a.captureAnalyticsPageview("/messages/3");
    expect(sdk.capture).not.toHaveBeenCalled();
    a.captureAnalyticsPageview("/feed");
    expect(sdk.capture).toHaveBeenCalledWith("$pageview", { $pathname: "/feed" });
  });

  it("attaches only the allowlisted link tags to the pageview, and registers them once as first touch", async () => {
    window.history.replaceState(null, "", "/feed?utm_source=news&utm_medium=email&utm_campaign=launch&utm_content=x&utm_term=y&gclid=g&secret=s");
    try {
      const a = await load();
      a.setAnalyticsConsent("granted");
      a.captureAnalyticsPageview("/feed");
      expect(sdk.capture).toHaveBeenCalledWith("$pageview", {
        $pathname: "/feed",
        utm_source: "news",
        utm_medium: "email",
        utm_campaign: "launch",
      });
      expect(sdk.register_once).toHaveBeenCalledWith({
        $initial_utm_source: "news",
        $initial_utm_medium: "email",
        $initial_utm_campaign: "launch",
      });
      expect(JSON.stringify(sdk.capture.mock.calls)).not.toMatch(/utm_content|utm_term|gclid|secret/);
    } finally {
      window.history.replaceState(null, "", "/");
    }
  });

  it("registers nothing when the URL carries no link tags", async () => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    a.captureAnalyticsPageview("/feed");
    expect(sdk.register_once).not.toHaveBeenCalled();
  });
});

describe("analytics init options", () => {
  it("opts out by default and turns off automatic collection", async () => {
    const a = await load();
    const opts = a.buildPostHogOptions(null);
    expect(opts).toMatchObject({
      opt_out_capturing_by_default: true,
      persistence: "memory",
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
    });
    expect(a.buildPostHogOptions("granted").persistence).toBe("localStorage+cookie");
  });

  it("wires the sanitiser as before_send", async () => {
    const a = await load();
    const before = a.buildPostHogOptions("granted").before_send;
    expect(typeof before).toBe("function");
    if (typeof before !== "function") return;
    expect(
      before({
        uuid: "u",
        event: "$pageview",
        properties: { $current_url: "https://bluecollarcrypto.io/login?callbackUrl=/x" },
      }),
    ).toBeNull();
  });
});

describe("analytics identity", () => {
  it("identifies with the server's pseudonym exactly as given, no person properties, only after consent", async () => {
    const a = await load();
    await a.setAnalyticsViewer("keyed-pseudonym-17");
    expect(sdk.identify).not.toHaveBeenCalled();

    a.setAnalyticsConsent("granted");
    await vi.waitFor(() => expect(sdk.identify).toHaveBeenCalledTimes(1));
    expect(sdk.identify).toHaveBeenCalledWith("keyed-pseudonym-17");
    expect(sdk.identify.mock.calls[0]).toHaveLength(1);
  });

  it("no longer exposes a client-side hash of the raw id", async () => {
    const a = (await load()) as Record<string, unknown>;
    expect(a["hashViewerId"]).toBeUndefined();
  });

  it("resets on a viewer switch and re-applies consent after reset", async () => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    await a.setAnalyticsViewer("17");
    sdk.opt_in_capturing.mockClear();

    await a.setAnalyticsViewer("18");
    expect(sdk.reset).toHaveBeenCalledTimes(1);
    expect(sdk.opt_in_capturing).toHaveBeenCalled();
    expect(sdk.identify).toHaveBeenLastCalledWith("18");
  });

  it("resets on sign-out and keeps the device's consent", async () => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    await a.setAnalyticsViewer("17");
    a.resetAnalyticsIdentity();

    expect(sdk.reset).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(a.CONSENT_STORAGE_KEY)).toBe("granted");
    a.captureAnalyticsEvent("message_sent");
    expect(sdk.capture).toHaveBeenCalledWith("message_sent", undefined);
  });
});
