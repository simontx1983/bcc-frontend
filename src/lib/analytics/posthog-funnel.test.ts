/**
 * The analytics wrapper's funnel pieces: the one-shot `signup_completed`
 * marker and the `member_status` super-property. Same harness as
 * posthog.test.ts — posthog-js mocked, a fresh module per test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type * as AnalyticsModule from "@/lib/analytics/posthog";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
  captureException: vi.fn(),
  identify: vi.fn(),
  register: vi.fn(),
  register_once: vi.fn(),
  reset: vi.fn(),
  opt_in_capturing: vi.fn(),
  opt_out_capturing: vi.fn(),
}));

vi.mock("posthog-js", () => ({ default: sdk }));

type Wrapper = typeof AnalyticsModule;

async function load(): Promise<Wrapper> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://ph.example");
  return import("@/lib/analytics/posthog");
}

const KEY = "bcc.analytics.signup_completed";
const captured = () => sdk.capture.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  for (const fn of Object.values(sdk)) fn.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("signup_completed one-shot marker", () => {
  it("holds the method token only, and is written only with consent", async () => {
    const a = await load();
    expect(a.SIGNUP_COMPLETED_STORAGE_KEY).toBe(KEY);
    a.noteSignupCompleted("google");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();

    a.setAnalyticsConsent("granted");
    a.noteSignupCompleted("google");
    expect(window.sessionStorage.getItem(KEY)).toBe("google");
    // Nothing is sent at the creation point itself.
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it("is consumed by the first ALLOWED pageview, after it, exactly once", async () => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    a.noteSignupCompleted("password");

    // Still on a denied route: nothing sent, marker kept.
    a.captureAnalyticsPageview("/verify-email");
    expect(sdk.capture).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(KEY)).toBe("password");

    a.captureAnalyticsPageview("/onboarding");
    expect(captured()).toEqual(["$pageview", "signup_completed"]);
    expect(sdk.capture).toHaveBeenLastCalledWith("signup_completed", { method: "password" });
    expect(window.sessionStorage.getItem(KEY)).toBeNull();

    a.captureAnalyticsPageview("/feed");
    expect(captured().filter((e) => e === "signup_completed")).toHaveLength(1);
  });

  it.each(["password", "google", "x", "wallet"] as const)("sends method %s and nothing else", async (method) => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    a.noteSignupCompleted(method);
    a.captureAnalyticsPageview("/onboarding");
    expect(sdk.capture).toHaveBeenCalledWith("signup_completed", { method });
  });

  it("is deleted UNSENT when consent is not granted at the pageview, and never queued", async () => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    a.noteSignupCompleted("wallet");
    a.setAnalyticsConsent("denied");
    sdk.capture.mockClear();

    a.captureAnalyticsPageview("/onboarding");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(sdk.capture).not.toHaveBeenCalled();

    // Opting in later must not resurrect it.
    a.setAnalyticsConsent("granted");
    a.captureAnalyticsPageview("/onboarding");
    expect(captured()).toEqual(["$pageview"]);
  });

  it("is deleted unsent when no consent choice was ever made", async () => {
    window.sessionStorage.setItem(KEY, "google");
    const a = await load();
    a.captureAnalyticsPageview("/onboarding");
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
    expect(sdk.capture).not.toHaveBeenCalled();
  });

  it("validates the stored token against the union on read", async () => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    window.sessionStorage.setItem(KEY, "alice@example.com");
    a.captureAnalyticsPageview("/onboarding");
    expect(captured()).toEqual(["$pageview"]);
    expect(window.sessionStorage.getItem(KEY)).toBeNull();
  });

  it("maps OAuth provider names to methods: twitter is x, anything else null", async () => {
    const a = await load();
    expect(a.signupMethodForProvider("google")).toBe("google");
    expect(a.signupMethodForProvider("twitter")).toBe("x");
    expect(a.signupMethodForProvider("github")).toBeNull();
    expect(a.signupMethodForProvider(null)).toBeNull();
  });
});

describe("member_status super-property", () => {
  it("is not registered before consent", async () => {
    const a = await load();
    await a.setAnalyticsViewer("17");
    a.resetAnalyticsIdentity();
    expect(sdk.register).not.toHaveBeenCalled();
  });

  it("is 'anonymous' at opt-in and 'member' once a viewer is set", async () => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    expect(sdk.register).toHaveBeenLastCalledWith({ member_status: "anonymous" });

    await a.setAnalyticsViewer("17");
    expect(sdk.register).toHaveBeenLastCalledWith({ member_status: "member" });
  });

  it("is 'member' at opt-in when the viewer was already signed in", async () => {
    const a = await load();
    await a.setAnalyticsViewer("17");
    a.setAnalyticsConsent("granted");
    expect(sdk.register).toHaveBeenLastCalledWith({ member_status: "member" });
  });

  it("is re-applied after a viewer-switch reset, which clears super-properties", async () => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    await a.setAnalyticsViewer("17");
    sdk.register.mockClear();

    await a.setAnalyticsViewer("18");
    const resetAt = sdk.reset.mock.invocationCallOrder[0] ?? Infinity;
    const after = sdk.register.mock.invocationCallOrder.filter((n) => n > resetAt);
    expect(after.length).toBeGreaterThan(0);
    expect(sdk.register).toHaveBeenLastCalledWith({ member_status: "member" });
  });

  it("becomes 'anonymous' on sign-out, registered after the reset", async () => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    await a.setAnalyticsViewer("17");
    a.resetAnalyticsIdentity();

    const resetAt = sdk.reset.mock.invocationCallOrder[0] ?? Infinity;
    const last = sdk.register.mock.invocationCallOrder.at(-1) ?? 0;
    expect(last).toBeGreaterThan(resetAt);
    expect(sdk.register).toHaveBeenLastCalledWith({ member_status: "anonymous" });
  });

  it("carries only member_status", async () => {
    const a = await load();
    a.setAnalyticsConsent("granted");
    await a.setAnalyticsViewer("17");
    a.resetAnalyticsIdentity();
    for (const [props] of sdk.register.mock.calls) {
      expect(Object.keys(props as object)).toEqual(["member_status"]);
    }
  });
});
