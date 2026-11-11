import { describe, expect, it } from "vitest";

import { ANALYTICS_DENIED_ROUTES } from "@/lib/analytics/sanitize";
import { vercelAnalyticsBeforeSend } from "@/lib/analytics/vercel";

const ORIGIN = "https://bluecollarcrypto.io";
const view = (url: string) => ({ type: "pageview" as const, url });

describe("Vercel Web Analytics beforeSend", () => {
  it("strips the query string and fragment", () => {
    expect(vercelAnalyticsBeforeSend(view(`${ORIGIN}/feed?utm_source=x&secret=y#top`))).toEqual(
      view(`${ORIGIN}/feed`),
    );
  });

  it("generalises a person path", () => {
    expect(vercelAnalyticsBeforeSend(view(`${ORIGIN}/u/alice?tab=posts`))).toEqual(
      view(`${ORIGIN}/u/[handle]`),
    );
    expect(vercelAnalyticsBeforeSend(view(`${ORIGIN}/u/alice/post/abc123`))).toEqual(
      view(`${ORIGIN}/u/[handle]/post/[shortcode]`),
    );
  });

  it("keeps a public entity page's slug", () => {
    expect(vercelAnalyticsBeforeSend(view(`${ORIGIN}/v/cosmoshub`))).toEqual(view(`${ORIGIN}/v/cosmoshub`));
  });

  it.each(ANALYTICS_DENIED_ROUTES)("drops %s and below", (route) => {
    expect(vercelAnalyticsBeforeSend(view(`${ORIGIN}${route}`))).toBeNull();
    expect(vercelAnalyticsBeforeSend(view(`${ORIGIN}${route}/x?token=t`))).toBeNull();
  });

  it("drops a denied route carrying its sensitive query", () => {
    expect(vercelAnalyticsBeforeSend(view(`${ORIGIN}/verify-email?email=a%40b.co&token=t`))).toBeNull();
  });

  it("treats custom events the same way", () => {
    expect(vercelAnalyticsBeforeSend({ type: "event" as const, url: `${ORIGIN}/feed?a=1` })).toEqual({
      type: "event",
      url: `${ORIGIN}/feed`,
    });
  });
});
