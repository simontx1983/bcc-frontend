import { describe, expect, it } from "vitest";

import {
  CAMPAIGN_VALUE_MAX,
  campaignKeyOf,
  generaliseUrlPath,
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
      $current_url: "https://bluecollarcrypto.io/u/[handle]",
      $referrer: "https://cms.example.com/page",
      $pathname: "/u/[handle]",
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
    expect(out?.properties["$current_url"]).toBe("https://bluecollarcrypto.io/u/[handle]");
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


describe("campaign properties — allowlist (user decision)", () => {
  it("keeps utm_source, utm_medium and utm_campaign in every prefixed form", () => {
    const out = sanitizeAnalyticsEvent(
      event({
        utm_source: "newsletter",
        $session_entry_utm_medium: "email",
        $initial_utm_campaign: "launch",
        $current_url: "https://x.io/",
      }),
    );
    expect(out?.properties).toMatchObject({
      utm_source: "newsletter",
      $session_entry_utm_medium: "email",
      $initial_utm_campaign: "launch",
    });
  });

  it.each([
    "utm_content",
    "utm_term",
    "utm_id",
    "$session_entry_utm_content",
    "$initial_utm_term",
    "gclid",
    "$session_entry_gclid",
    "fbclid",
    "$initial_fbclid",
    "msclkid",
    "ttclid",
  ])("drops %s", (key) => {
    const out = sanitizeAnalyticsEvent(event({ [key]: "someone@example.com", $current_url: "https://x.io/" }));
    expect(out?.properties).not.toHaveProperty(key);
    expect(JSON.stringify(out)).not.toContain("someone@example.com");
  });

  it("applies to person properties too ($set / $set_once)", () => {
    const out = sanitizeAnalyticsEvent(
      event(
        { $current_url: "https://x.io/" },
        { $set: { utm_source: "a", utm_term: "x" }, $set_once: { $initial_utm_campaign: "c", $initial_gclid: "g" } },
      ),
    );
    expect(out?.$set).toEqual({ utm_source: "a" });
    expect(out?.$set_once).toEqual({ $initial_utm_campaign: "c" });
  });

  it(`caps a kept value at ${CAMPAIGN_VALUE_MAX} characters`, () => {
    const long = "x".repeat(CAMPAIGN_VALUE_MAX + 50);
    const out = sanitizeAnalyticsEvent(event({ $session_entry_utm_source: long, $current_url: "https://x.io/" }));
    expect((out?.properties["$session_entry_utm_source"] as string).length).toBe(CAMPAIGN_VALUE_MAX);
  });

  it("leaves non-campaign properties alone", () => {
    expect(campaignKeyOf("$browser")).toBeNull();
    expect(campaignKeyOf("$session_entry_url")).toBeNull();
    expect(campaignKeyOf("title")).toBeNull();
    expect(campaignKeyOf("$session_entry_utm_source")).toBe("utm_source");
  });

  it("the live payload shape: a utm_source entry is kept, query and fragment are not", () => {
    const out = sanitizeAnalyticsEvent(
      event({
        $current_url: "https://bluecollarcrypto.io/?utm_source=smoketest&secret=abc123#frag",
        $session_entry_url: "https://bluecollarcrypto.io/?utm_source=smoketest&secret=abc123#frag",
        $session_entry_utm_source: "smoketest",
        $session_entry_utm_content: "leak",
      }),
    );
    const json = JSON.stringify(out);
    expect(json).not.toMatch(/secret|abc123|#frag|leak/);
    expect(out?.properties["$session_entry_utm_source"]).toBe("smoketest");
  });
});


describe("person-identifying paths are generalised (user decision)", () => {
  it.each([
    ["/u/alice", "/u/[handle]"],
    ["/u/alice/followers", "/u/[handle]/followers"],
    ["/u/alice/post/AbC12", "/u/[handle]/post/[shortcode]"],
    ["/post/123", "/post/[id]"],
    ["/disputes/77", "/disputes/[id]"],
    ["https://bluecollarcrypto.io/u/alice", "https://bluecollarcrypto.io/u/[handle]"],
    ["https://bluecollarcrypto.io/u/alice/post/X1", "https://bluecollarcrypto.io/u/[handle]/post/[shortcode]"],
  ])("%s → %s", (input, expected) => {
    expect(generaliseUrlPath(input)).toBe(expected);
  });

  it.each([
    "/",
    "/v/cosmoshub-validator",
    "/p/some-project",
    "/c/some-collection",
    "/communities/hammers",
    "/halls/main",
    "/t/defi",
    "https://bluecollarcrypto.io/feed",
    "https://bluecollarcrypto.io",
  ])("leaves %s alone (public entities and plain pages)", (input) => {
    expect(generaliseUrlPath(input)).toBe(input);
  });

  it("rewrites every URL property of a profile pageview and drops its title", () => {
    const out = sanitizeAnalyticsEvent(
      event({
        $current_url: "https://bluecollarcrypto.io/u/alice?tab=reviews#x",
        $pathname: "/u/alice",
        $referrer: "https://bluecollarcrypto.io/u/bob/post/Z9",
        $session_entry_url: "https://bluecollarcrypto.io/u/alice",
        title: "Alice Example (@alice) · Blue Collar Crypto",
      }),
    );
    expect(out?.properties).toMatchObject({
      $current_url: "https://bluecollarcrypto.io/u/[handle]",
      $pathname: "/u/[handle]",
      $referrer: "https://bluecollarcrypto.io/u/[handle]/post/[shortcode]",
      $session_entry_url: "https://bluecollarcrypto.io/u/[handle]",
    });
    expect(out?.properties).not.toHaveProperty("title");
    expect(JSON.stringify(out)).not.toMatch(/alice|bob|Z9/i);
  });

  it("keeps the title on a non-person page", () => {
    const out = sanitizeAnalyticsEvent(event({ $pathname: "/feed", $current_url: "https://x.io/feed", title: "Feed" }));
    expect(out?.properties["title"]).toBe("Feed");
  });
});


describe("exception text never quotes a person's path", () => {
  it("generalises /u/<handle>, /post/<id> and /disputes/<id> inside exception payloads", () => {
    const out = sanitizeAnalyticsEvent({
      event: "$exception",
      properties: {
        $current_url: "https://bluecollarcrypto.io/feed",
        $exception_message: "Failed loading https://bluecollarcrypto.io/u/alice?x=1 from /u/bob/post/Q7 and /disputes/42",
      },
    });
    const msg = String(out?.properties["$exception_message"]);
    expect(msg).not.toMatch(/alice|bob|Q7|42/);
    expect(msg).toContain("/u/[handle]");
  });
});
