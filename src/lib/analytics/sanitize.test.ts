import { describe, expect, it } from "vitest";

import {
  isDeniedAnalyticsPath,
  sanitizeAnalyticsEvent,
  stripQueryAndHash,
  type SanitizableEvent,
} from "@/lib/analytics/sanitize";

function event(
  properties: Record<string, unknown>,
  extra: Partial<SanitizableEvent> = {},
): SanitizableEvent {
  return { event: "$pageview", properties, ...extra };
}

describe("stripQueryAndHash", () => {
  it("cuts at the first ? or #", () => {
    expect(stripQueryAndHash("https://x.io/a?b=1#c")).toBe("https://x.io/a");
    expect(stripQueryAndHash("/a#c?b")).toBe("/a");
    expect(stripQueryAndHash("/plain")).toBe("/plain");
  });
});

describe("isDeniedAnalyticsPath", () => {
  it.each([
    "/login",
    "/login/two-factor",
    "/signup/complete-profile",
    "/verify-email",
    "/forgot-password",
    "/reset-password",
    "/api/auth/callback/google",
    "/messages",
    "/messages/new",
    "/messages/42",
    "/verify-email/",
    "/reset-password?token=abc",
  ])("denies %s", (path) => {
    expect(isDeniedAnalyticsPath(path)).toBe(true);
  });

  it.each(["/", "/signup", "/u/alice", "/loginx", "/messagesboard", "/privacy"])(
    "allows %s",
    (path) => {
      expect(isDeniedAnalyticsPath(path)).toBe(false);
    },
  );
});

describe("sanitizeAnalyticsEvent", () => {
  it("strips query and hash from every URL-valued property", () => {
    const out = sanitizeAnalyticsEvent(
      event({
        $current_url: "https://bluecollarcrypto.io/u/alice?ref=x#posts",
        $referrer: "https://cms.example.com/page?code=abc&state=def",
        $pathname: "/u/alice?tab=1",
        $initial_current_url: "https://bluecollarcrypto.io/?pt=secret",
        $initial_referrer: "https://google.com/search?q=me#top",
        $prev_pageview_pathname: "/feed?x=1",
        some_link: "https://other.example/path?email=a%40b.c",
      }),
    );
    expect(out?.properties).toEqual({
      $current_url: "https://bluecollarcrypto.io/u/alice",
      $referrer: "https://cms.example.com/page",
      $pathname: "/u/alice",
      $initial_current_url: "https://bluecollarcrypto.io/",
      $initial_referrer: "https://google.com/search",
      $prev_pageview_pathname: "/feed",
      some_link: "https://other.example/path",
    });
  });

  it("strips URLs held in $set and $set_once person properties", () => {
    const out = sanitizeAnalyticsEvent(
      event(
        { $current_url: "https://bluecollarcrypto.io/" },
        {
          $set: { $current_url: "https://bluecollarcrypto.io/a?x=1" },
          $set_once: {
            $initial_current_url: "https://bluecollarcrypto.io/?token=t",
            $initial_referrer: "https://ref.example/?code=c",
          },
        },
      ),
    );
    expect(out?.$set).toEqual({ $current_url: "https://bluecollarcrypto.io/a" });
    expect(out?.$set_once).toEqual({
      $initial_current_url: "https://bluecollarcrypto.io/",
      $initial_referrer: "https://ref.example/",
    });
  });

  it("drops events raised on a denied route, by URL or by pathname", () => {
    expect(
      sanitizeAnalyticsEvent(
        event({ $current_url: "https://bluecollarcrypto.io/verify-email?token=abc" }),
      ),
    ).toBeNull();
    expect(
      sanitizeAnalyticsEvent(
        event({ $current_url: "https://bluecollarcrypto.io/signup/complete-profile?pt=x&email=a@b.c" }),
      ),
    ).toBeNull();
    expect(
      sanitizeAnalyticsEvent(event({ $pathname: "/login/two-factor" })),
    ).toBeNull();
    expect(
      sanitizeAnalyticsEvent(
        event({ $current_url: "https://bluecollarcrypto.io/messages/12" }),
      ),
    ).toBeNull();
  });

  it("leaves non-URL properties untouched", () => {
    const props = {
      $current_url: "https://bluecollarcrypto.io/feed",
      post_type: "status",
      is_group_post: false,
      cards_pulled: 3,
      visibility: "public",
      note: "what? really #1",
      nested: { a: "b?c" },
      $referrer: "$direct",
    };
    const out = sanitizeAnalyticsEvent(event(props));
    expect(out?.properties).toEqual(props);
  });

  it("scrubs URLs embedded in exception payloads", () => {
    const out = sanitizeAnalyticsEvent({
      event: "$exception",
      properties: {
        $current_url: "https://bluecollarcrypto.io/u/alice?x=1",
        $exception_message:
          "Failed to fetch https://cms.example.com/wp-json/x?token=abc#h and /reset-password?token=zz",
        $exception_list: [
          {
            value: "Bad request to /verify-email?email=a@b.c",
            stacktrace: {
              frames: [
                { filename: "https://bluecollarcrypto.io/_next/chunk.js?v=1", lineno: 3 },
              ],
            },
          },
        ],
      },
    });
    expect(out?.properties["$current_url"]).toBe("https://bluecollarcrypto.io/u/alice");
    expect(out?.properties["$exception_message"]).toBe(
      "Failed to fetch https://cms.example.com/wp-json/x and /reset-password",
    );
    expect(out?.properties["$exception_list"]).toEqual([
      {
        value: "Bad request to /verify-email",
        stacktrace: {
          frames: [{ filename: "https://bluecollarcrypto.io/_next/chunk.js", lineno: 3 }],
        },
      },
    ]);
  });

  it("drops exceptions raised on a denied route", () => {
    expect(
      sanitizeAnalyticsEvent({
        event: "$exception",
        properties: {
          $current_url: "https://bluecollarcrypto.io/reset-password?token=abc",
          $exception_message: "boom",
        },
      }),
    ).toBeNull();
  });

  it("passes a null event through", () => {
    expect(sanitizeAnalyticsEvent(null)).toBeNull();
  });
});
