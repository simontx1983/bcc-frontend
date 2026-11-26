import { describe, expect, it } from "vitest";
import { filterSignupAgeBreadcrumb, isSignupAgeRequest } from "@/lib/sentry/signup-age";

describe("signup age telemetry exclusions", () => {
  it("identifies the eligibility request regardless of origin or query", () => {
    expect(isSignupAgeRequest("https://example.test/wp-json/bcc/v1/auth/age-eligibility")).toBe(true);
    expect(isSignupAgeRequest("/api/bcc/auth/age-eligibility?probe=1")).toBe(true);
    expect(isSignupAgeRequest("/auth/login?next=/auth/age-eligibility")).toBe(false);
    expect(isSignupAgeRequest("/auth/signup")).toBe(false);
  });

  it.each(["xhr", "fetch"])("drops %s breadcrumbs for both outcomes", (category) => {
    const url = "/wp-json/bcc/v1/auth/age-eligibility";
    expect(filterSignupAgeBreadcrumb({ category, data: { url, status_code: 200 } })).toBeNull();
    expect(filterSignupAgeBreadcrumb({ category, data: { url, status_code: 403 } })).toBeNull();
    const other = { category, data: { url: "/auth/login", status_code: 403 } };
    expect(filterSignupAgeBreadcrumb(other)).toBe(other);
  });
});
