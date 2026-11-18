/**
 * S5 — security headers on every route. Pins the header set, that
 * anti-framing is ENFORCED (frame-ancestors is ignored inside a
 * Report-Only CSP), that the full CSP stays REPORT-ONLY, and that
 * next.config.ts applies them to every path.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { buildReportOnlyCsp, buildSecurityHeaders } from "./security-headers";

const PROD = {
  dev: false,
  apiUrl: "https://cms.bluecollarcrypto.io/wp-json",
  posthogHost: "https://us.i.posthog.com",
  sentryDsn: "https://abc123@o42.ingest.us.sentry.io/7",
};

const header = (key: string, env = PROD) =>
  buildSecurityHeaders(env).find((h) => h.key === key)?.value;

const directive = (csp: string, name: string): string[] =>
  csp
    .split(";")
    .map((d) => d.trim().split(/\s+/))
    .find((parts) => parts[0] === name)
    ?.slice(1) ?? [];

describe("S5 security headers", () => {
  it("sends exactly the six headers", () => {
    expect(buildSecurityHeaders(PROD).map((h) => h.key)).toEqual([
      "X-Frame-Options",
      "Content-Security-Policy",
      "X-Content-Type-Options",
      "Referrer-Policy",
      "Permissions-Policy",
      "Content-Security-Policy-Report-Only",
    ]);
  });

  it("Permissions-Policy denies the unused powerful features and nothing the app uses", () => {
    const policy = header("Permissions-Policy") ?? "";
    const entries = policy.split(",").map((e) => e.trim());
    // Every entry is a deny (empty allow-list) — nothing is granted.
    for (const entry of entries) expect(entry).toMatch(/^[a-z-]+=\(\)$/);
    const denied = entries.map((e) => e.replace("=()", ""));
    expect(denied).toEqual(
      expect.arrayContaining([
        "camera",
        "microphone",
        "geolocation",
        "payment",
        "usb",
        "hid",
        "serial",
        "bluetooth",
      ]),
    );
    // Used by ShareButton / useCopyConfirm / native video controls.
    for (const used of ["web-share", "clipboard-write", "clipboard-read", "fullscreen"]) {
      expect(denied).not.toContain(used);
    }
  });

  it("enforces anti-framing two ways, and enforces nothing else", () => {
    expect(header("X-Frame-Options")).toBe("DENY");
    // The ONLY enforced CSP directive — anything more could break pages
    // before the report-only policy has been watched.
    expect(header("Content-Security-Policy")).toBe("frame-ancestors 'none'");
  });

  it("nosniff and the referrer policy", () => {
    expect(header("X-Content-Type-Options")).toBe("nosniff");
    expect(header("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });

  it("the full CSP is report-only and covers what the app loads", () => {
    const csp = header("Content-Security-Policy-Report-Only") ?? "";
    expect(directive(csp, "default-src")).toEqual(["'self'"]);
    expect(directive(csp, "connect-src")).toEqual(
      expect.arrayContaining([
        "'self'",
        "https://cms.bluecollarcrypto.io",
        "https://stage.bluecollarcrypto.io",
        "https://us.i.posthog.com",
        "https://*.posthog.com",
        "https://o42.ingest.us.sentry.io",
        "https://api.giphy.com",
      ]),
    );
    expect(directive(csp, "img-src")).toEqual(
      expect.arrayContaining(["'self'", "data:", "blob:", "https:", "https://cms.bluecollarcrypto.io"]),
    );
    expect(directive(csp, "object-src")).toEqual(["'none'"]);
    expect(directive(csp, "frame-ancestors")).toEqual(["'none'"]);
    expect(directive(csp, "report-uri")).toEqual([
      "https://o42.ingest.us.sentry.io/api/7/security/?sentry_key=abc123",
    ]);
  });

  it("'unsafe-eval' only in dev", () => {
    expect(directive(buildReportOnlyCsp(PROD), "script-src")).not.toContain("'unsafe-eval'");
    expect(directive(buildReportOnlyCsp({ ...PROD, dev: true }), "script-src")).toContain("'unsafe-eval'");
  });

  it("missing or malformed env degrades to the fixed allow-list, with no report-uri", () => {
    const csp = buildReportOnlyCsp({ dev: false, apiUrl: "", posthogHost: "not a url", sentryDsn: undefined });
    expect(directive(csp, "connect-src")).toContain("https://cms.bluecollarcrypto.io");
    expect(directive(csp, "connect-src")).not.toContain("not");
    expect(directive(csp, "report-uri")).toEqual([]);
  });

  it("next.config.ts applies them to every route", () => {
    const cfg = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf-8");
    expect(cfg).toMatch(/async headers\(\)/);
    expect(cfg).toMatch(/source: "\/:path\*",\s*headers: buildSecurityHeaders\(/);
  });
});
